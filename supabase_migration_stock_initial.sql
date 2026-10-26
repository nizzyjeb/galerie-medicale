do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check check (role in ('admin','comptable','livreur','logistique'));

alter table public.produits add column if not exists stock_gere boolean default false;
alter table public.produits add column if not exists stock_actuel numeric(12,2) default 0;
alter table public.produits add column if not exists seuil_alerte numeric(12,2) default 0;
alter table public.produits add column if not exists stock_initial numeric(12,2);
alter table public.produits add column if not exists stock_initial_saisi_par uuid;
alter table public.produits add column if not exists stock_initial_saisi_le timestamptz;
alter table public.produits add column if not exists stock_initial_valide boolean not null default false;
alter table public.produits add column if not exists stock_initial_valide_par uuid;
alter table public.produits add column if not exists stock_initial_valide_le timestamptz;

create table if not exists public.mouvements_stock (
  id bigserial primary key,
  produit_id bigint references public.produits(id) on delete set null,
  produit_designation text,
  type text not null,
  quantite numeric(12,2) not null,
  motif text,
  reference_doc text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.mouvements_stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.mouvements_stock drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.mouvements_stock add constraint mouvements_stock_type_check check (type in ('entree','sortie','ajustement','initial','validation'));

create or replace function public.gm_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and coalesce(actif, true) = true
$$;

create or replace function public.fn_appliquer_mouvement(
  p_produit_id bigint,
  p_type text,
  p_delta numeric,
  p_motif text,
  p_ref text,
  p_user uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_designation text;
  v_nouveau numeric;
begin
  select designation into v_designation from public.produits where id = p_produit_id;

  perform set_config('gm.stock_fn', 'on', true);
  update public.produits
     set stock_actuel = coalesce(stock_actuel, 0) + p_delta,
         updated_at = now()
   where id = p_produit_id
  returning stock_actuel into v_nouveau;
  perform set_config('gm.stock_fn', 'off', true);

  insert into public.mouvements_stock (produit_id, produit_designation, type, quantite, motif, reference_doc, created_by)
  values (p_produit_id, v_designation, p_type, p_delta, p_motif, p_ref, coalesce(auth.uid(), p_user));

  return v_nouveau;
end;
$$;

revoke all on function public.fn_appliquer_mouvement(bigint, text, numeric, text, text, uuid) from public, anon, authenticated;

create or replace function public.gm_produits_protection_stock()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or coalesce(current_setting('gm.stock_fn', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.stock_actuel := 0;
    new.stock_initial := null;
    new.stock_initial_saisi_par := null;
    new.stock_initial_saisi_le := null;
    new.stock_initial_valide := false;
    new.stock_initial_valide_par := null;
    new.stock_initial_valide_le := null;
    return new;
  end if;
  if new.stock_actuel is distinct from old.stock_actuel
     or new.stock_initial is distinct from old.stock_initial
     or new.stock_initial_saisi_par is distinct from old.stock_initial_saisi_par
     or new.stock_initial_saisi_le is distinct from old.stock_initial_saisi_le
     or new.stock_initial_valide is distinct from old.stock_initial_valide
     or new.stock_initial_valide_par is distinct from old.stock_initial_valide_par
     or new.stock_initial_valide_le is distinct from old.stock_initial_valide_le
     or (old.stock_initial_valide and new.stock_gere is distinct from old.stock_gere and public.gm_role() is distinct from 'admin') then
    raise exception 'Le stock ne peut être modifié que depuis la page Stock (saisie initiale ou mouvement).';
  end if;
  return new;
end;
$$;

drop trigger if exists gm_produits_protection_stock on public.produits;
create trigger gm_produits_protection_stock
  before insert or update on public.produits
  for each row execute function public.gm_produits_protection_stock();

create or replace function public.fn_stock_saisir_initial(p_produit_id bigint, p_quantite numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.produits%rowtype;
  v_delta numeric;
  v_nouveau numeric;
begin
  if public.gm_role() is null or public.gm_role() not in ('admin','comptable','logistique') then
    raise exception 'Accès refusé : saisie réservée à l''administrateur, au comptable / secrétaire et au responsable logistique.';
  end if;
  if p_quantite is null or p_quantite < 0 then
    raise exception 'Quantité invalide.';
  end if;

  select * into p from public.produits where id = p_produit_id for update;
  if not found then
    raise exception 'Produit introuvable.';
  end if;
  if p.stock_initial_valide then
    raise exception 'Le stock initial de « % » est déjà validé : il ne peut plus être modifié.', p.designation;
  end if;

  if p.stock_initial_saisi_le is null then
    v_delta := p_quantite - coalesce(p.stock_actuel, 0);
  else
    v_delta := p_quantite - coalesce(p.stock_initial, 0);
  end if;

  perform set_config('gm.stock_fn', 'on', true);
  update public.produits
     set stock_gere = true,
         stock_initial = p_quantite,
         stock_initial_saisi_par = auth.uid(),
         stock_initial_saisi_le = now(),
         updated_at = now()
   where id = p_produit_id;
  perform set_config('gm.stock_fn', 'off', true);

  v_nouveau := public.fn_appliquer_mouvement(p_produit_id, 'initial', v_delta,
    case when p.stock_initial_saisi_le is null then 'Stock initial saisi : ' else 'Stock initial corrigé avant validation : ' end || p_quantite,
    null, auth.uid());

  return v_nouveau;
end;
$$;

create or replace function public.fn_stock_valider_initial(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  if public.gm_role() is distinct from 'admin' then
    raise exception 'Seul un administrateur peut valider les stocks initiaux.';
  end if;

  for r in
    select id, designation, stock_initial from public.produits
     where id = any(p_ids) and stock_initial_saisi_le is not null and not stock_initial_valide
     for update
  loop
    perform set_config('gm.stock_fn', 'on', true);
    update public.produits
       set stock_initial_valide = true,
           stock_initial_valide_par = auth.uid(),
           stock_initial_valide_le = now(),
           updated_at = now()
     where id = r.id;
    perform set_config('gm.stock_fn', 'off', true);

    insert into public.mouvements_stock (produit_id, produit_designation, type, quantite, motif, created_by)
    values (r.id, r.designation, 'validation', 0, 'Stock initial validé et verrouillé : ' || r.stock_initial, auth.uid());
    n := n + 1;
  end loop;

  return n;
end;
$$;

create or replace function public.fn_stock_mouvement(
  p_produit_id bigint,
  p_type text,
  p_quantite numeric,
  p_motif text default null,
  p_ref text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.produits%rowtype;
  v_role text := public.gm_role();
  v_delta numeric;
begin
  if v_role is null or v_role not in ('admin','comptable','logistique') then
    raise exception 'Accès refusé.';
  end if;
  if p_type not in ('entree','sortie','ajustement') then
    raise exception 'Type de mouvement invalide.';
  end if;
  if p_quantite is null or p_quantite < 0 or (p_type <> 'ajustement' and p_quantite = 0) then
    raise exception 'Quantité invalide.';
  end if;

  select * into p from public.produits where id = p_produit_id for update;
  if not found then
    raise exception 'Produit introuvable.';
  end if;

  if p_type = 'ajustement' then
    if v_role <> 'admin' then
      raise exception 'Seul un administrateur peut corriger un stock.';
    end if;
    v_delta := p_quantite - coalesce(p.stock_actuel, 0);
    if v_delta = 0 then
      raise exception 'Aucun changement : le stock est déjà de %.', p_quantite;
    end if;
    if coalesce(trim(p_motif), '') = '' then
      raise exception 'Indiquez le motif de la correction.';
    end if;
  else
    if p_ref is null and not p.stock_initial_valide then
      raise exception 'Le stock initial de « % » doit être saisi puis validé par un administrateur avant tout mouvement.', p.designation;
    end if;
    if p_type = 'entree' then
      v_delta := p_quantite;
    else
      v_delta := -p_quantite;
      if coalesce(p.stock_actuel, 0) + v_delta < 0 then
        raise exception 'Stock insuffisant pour « % » : % disponible(s).', p.designation, coalesce(p.stock_actuel, 0);
      end if;
    end if;
  end if;

  if p_ref is not null and not coalesce(p.stock_gere, false) then
    return p.stock_actuel;
  end if;

  return public.fn_appliquer_mouvement(p_produit_id, p_type, v_delta,
    coalesce(nullif(trim(p_motif), ''), case p_type when 'entree' then 'Entrée manuelle' when 'sortie' then 'Sortie manuelle' else 'Correction de stock' end),
    p_ref, auth.uid());
end;
$$;

create or replace function public.fn_stock_config(p_produit_id bigint, p_seuil numeric, p_gere boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.gm_role();
begin
  if v_role is null or v_role not in ('admin','comptable','logistique') then
    raise exception 'Accès refusé.';
  end if;
  if p_gere is not null and v_role <> 'admin' then
    raise exception 'Seul un administrateur peut activer ou désactiver le suivi de stock.';
  end if;
  update public.produits
     set seuil_alerte = greatest(coalesce(p_seuil, 0), 0),
         stock_gere = coalesce(p_gere, stock_gere),
         updated_at = now()
   where id = p_produit_id;
end;
$$;

revoke all on function public.fn_stock_saisir_initial(bigint, numeric) from public, anon;
revoke all on function public.fn_stock_valider_initial(bigint[]) from public, anon;
revoke all on function public.fn_stock_mouvement(bigint, text, numeric, text, text) from public, anon;
revoke all on function public.fn_stock_config(bigint, numeric, boolean) from public, anon;
grant execute on function public.fn_stock_saisir_initial(bigint, numeric) to authenticated;
grant execute on function public.fn_stock_valider_initial(bigint[]) to authenticated;
grant execute on function public.fn_stock_mouvement(bigint, text, numeric, text, text) to authenticated;
grant execute on function public.fn_stock_config(bigint, numeric, boolean) to authenticated;
grant execute on function public.gm_role() to authenticated;

alter table public.mouvements_stock enable row level security;
drop policy if exists p_mvt_read on public.mouvements_stock;
create policy p_mvt_read on public.mouvements_stock for select to authenticated using (true);
drop policy if exists p_mvt_write on public.mouvements_stock;

select count(*) filter (where stock_gere) as produits_suivis,
       count(*) filter (where stock_initial_valide) as stocks_initiaux_valides
  from public.produits;
