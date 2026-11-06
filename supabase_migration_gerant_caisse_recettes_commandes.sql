create extension if not exists pgcrypto with schema extensions;

create or replace function public.gm_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and coalesce(actif, true) = true
$$;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','gerant','comptable','livreur','logistique'));

drop policy if exists ecriture_produits on public.produits;
create policy ecriture_produits on public.produits for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists ecriture_clients on public.clients;
create policy ecriture_clients on public.clients for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists ecriture_facture_lignes on public.facture_lignes;
create policy ecriture_facture_lignes on public.facture_lignes for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));

drop policy if exists ecriture_factures on public.factures;
create policy ecriture_factures on public.factures for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists insert_factures on public.factures;
create policy insert_factures on public.factures for insert to authenticated
  with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists update_factures on public.factures;
create policy update_factures on public.factures for update to authenticated
  using (public.gm_role() in ('admin','gerant') or (public.gm_role() = 'comptable' and (type = 'proforma' or valide = false)));
drop policy if exists delete_factures on public.factures;
create policy delete_factures on public.factures for delete to authenticated
  using (public.gm_role() = 'admin' or (public.gm_role() in ('gerant','comptable') and (type = 'proforma' or valide = false)));

drop policy if exists p_fourn_write on public.fournisseurs;
create policy p_fourn_write on public.fournisseurs for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable')) with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists p_bc_write on public.bons_commande;
create policy p_bc_write on public.bons_commande for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable')) with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists p_bcl_write on public.bon_commande_lignes;
create policy p_bcl_write on public.bon_commande_lignes for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable')) with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists p_mvt_write on public.mouvements_stock;
create policy p_mvt_write on public.mouvements_stock for all to authenticated
  using (public.gm_role() in ('admin','gerant','comptable','logistique')) with check (public.gm_role() in ('admin','gerant','comptable','logistique'));

drop policy if exists "historique_lecture" on public.document_historique;
create policy "historique_lecture" on public.document_historique for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));

drop policy if exists employes_select on public.employes;
create policy employes_select on public.employes for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable') or user_id = auth.uid());
drop policy if exists employes_gerant on public.employes;
create policy employes_gerant on public.employes for all to authenticated
  using (public.gm_role() = 'gerant') with check (public.gm_role() = 'gerant');
drop policy if exists parametres_paie_select on public.parametres_paie;
create policy parametres_paie_select on public.parametres_paie for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists bulletins_select on public.bulletins_paie;
create policy bulletins_select on public.bulletins_paie for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable') or employe_id in (select id from public.employes where user_id = auth.uid()));
drop policy if exists bulletins_comptable_insert on public.bulletins_paie;
create policy bulletins_comptable_insert on public.bulletins_paie for insert to authenticated
  with check (public.gm_role() in ('gerant','comptable') and statut = 'brouillon');
drop policy if exists bulletins_comptable_update on public.bulletins_paie;
create policy bulletins_comptable_update on public.bulletins_paie for update to authenticated
  using (public.gm_role() in ('gerant','comptable') and statut = 'brouillon')
  with check (public.gm_role() in ('gerant','comptable') and statut = 'brouillon');
drop policy if exists bulletins_comptable_delete on public.bulletins_paie;
create policy bulletins_comptable_delete on public.bulletins_paie for delete to authenticated
  using (public.gm_role() in ('gerant','comptable') and statut = 'brouillon');

drop policy if exists depenses_select on public.depenses;
create policy depenses_select on public.depenses for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists depenses_gerant on public.depenses;
create policy depenses_gerant on public.depenses for all to authenticated
  using (public.gm_role() = 'gerant') with check (public.gm_role() = 'gerant');

drop policy if exists justificatifs_select on storage.objects;
create policy justificatifs_select on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists justificatifs_insert on storage.objects;
create policy justificatifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists justificatifs_update on storage.objects;
create policy justificatifs_update on storage.objects for update to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists justificatifs_delete on storage.objects;
create policy justificatifs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','gerant','comptable'));

create table if not exists public.caisse_config (
  id int primary key default 1 check (id = 1),
  code_hash text not null,
  modifie_par uuid,
  modifie_le timestamptz default now()
);
alter table public.caisse_config enable row level security;
insert into public.caisse_config (id, code_hash) values (1, extensions.crypt('963963', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create or replace function public.fn_caisse_verifier_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.caisse_config where id = 1 and code_hash = extensions.crypt(coalesce(p_code, ''), code_hash))
$$;

create or replace function public.fn_caisse_definir_code(p_ancien text, p_nouveau text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.gm_role() <> 'admin' then
    raise exception 'Seul un administrateur peut modifier le code de caisse.';
  end if;
  if not public.fn_caisse_verifier_code(p_ancien) then
    raise exception 'Code de caisse actuel incorrect.';
  end if;
  if p_nouveau is null or length(p_nouveau) < 4 or length(p_nouveau) > 12 then
    raise exception 'Le nouveau code doit comporter entre 4 et 12 caractères.';
  end if;
  update public.caisse_config
     set code_hash = extensions.crypt(p_nouveau, extensions.gen_salt('bf')), modifie_par = auth.uid(), modifie_le = now()
   where id = 1;
  return true;
end;
$$;

create table if not exists public.caisse_ouvertures (
  id uuid primary key default gen_random_uuid(),
  date_ouverture date not null unique,
  solde_ouverture numeric(14,2) not null default 0,
  ouvert_par uuid,
  ouvert_at timestamptz default now()
);
alter table public.caisse_ouvertures enable row level security;
drop policy if exists caisse_ouvertures_select on public.caisse_ouvertures;
create policy caisse_ouvertures_select on public.caisse_ouvertures for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));

alter table public.caisse_mouvements add column if not exists valide boolean not null default false;
alter table public.caisse_mouvements add column if not exists valide_par uuid;
alter table public.caisse_mouvements add column if not exists valide_le timestamptz;
alter table public.caisse_mouvements add column if not exists facture_id bigint;
alter table public.caisse_mouvements add column if not exists recette_id uuid;

create or replace function public.fn_caisse_ouvrir(p_code text, p_date date)
returns public.caisse_ouvertures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.gm_role();
  v_prev record;
  v_solde numeric := 0;
  v_row public.caisse_ouvertures;
begin
  if v_role not in ('admin','gerant','comptable') then
    raise exception 'Accès refusé.';
  end if;
  if not public.fn_caisse_verifier_code(p_code) then
    raise exception 'Code de caisse incorrect.';
  end if;
  if v_role <> 'admin' and p_date <> current_date then
    raise exception 'Seul un administrateur peut ouvrir une autre journée que celle du jour.';
  end if;
  if exists (select 1 from public.caisse_clotures where date_cloture = p_date) then
    raise exception 'Cette journée est déjà clôturée.';
  end if;
  if exists (select 1 from public.caisse_ouvertures where date_ouverture = p_date) then
    select * into v_row from public.caisse_ouvertures where date_ouverture = p_date;
    return v_row;
  end if;
  select solde_reel, solde_theorique into v_prev from public.caisse_clotures
   where date_cloture < p_date order by date_cloture desc limit 1;
  if found then
    v_solde := coalesce(v_prev.solde_reel, v_prev.solde_theorique, 0);
  end if;
  insert into public.caisse_ouvertures (date_ouverture, solde_ouverture, ouvert_par)
  values (p_date, v_solde, auth.uid()) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.fn_caisse_cloturer(p_code text, p_date date, p_solde_reel numeric, p_commentaire text default null)
returns public.caisse_clotures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.gm_role();
  v_ouv public.caisse_ouvertures;
  v_entrees numeric := 0;
  v_sorties numeric := 0;
  v_theorique numeric := 0;
  v_row public.caisse_clotures;
begin
  if v_role not in ('admin','gerant','comptable') then
    raise exception 'Accès refusé.';
  end if;
  if not public.fn_caisse_verifier_code(p_code) then
    raise exception 'Code de caisse incorrect.';
  end if;
  if exists (select 1 from public.caisse_clotures where date_cloture = p_date) then
    raise exception 'Cette journée est déjà clôturée.';
  end if;
  select * into v_ouv from public.caisse_ouvertures where date_ouverture = p_date;
  if not found then
    raise exception 'La caisse n''a pas été ouverte pour cette journée.';
  end if;
  if exists (select 1 from public.caisse_mouvements where date_mouvement = p_date and valide = false) then
    raise exception 'Des mouvements ne sont pas encore validés. Validez-les ou supprimez-les avant la clôture.';
  end if;
  select coalesce(sum(case when type = 'entree' then montant else 0 end), 0),
         coalesce(sum(case when type = 'sortie' then montant else 0 end), 0)
    into v_entrees, v_sorties
    from public.caisse_mouvements where date_mouvement = p_date;
  v_theorique := v_ouv.solde_ouverture + v_entrees - v_sorties;
  insert into public.caisse_clotures (date_cloture, solde_ouverture, total_entrees, total_sorties, solde_theorique, solde_reel, ecart, commentaire, cloture_par)
  values (p_date, v_ouv.solde_ouverture, v_entrees, v_sorties, v_theorique, p_solde_reel, p_solde_reel - v_theorique, nullif(trim(coalesce(p_commentaire, '')), ''), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.fn_caisse_rouvrir(p_code text, p_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.gm_role() <> 'admin' then
    raise exception 'Seul un administrateur peut rouvrir une journée clôturée.';
  end if;
  if not public.fn_caisse_verifier_code(p_code) then
    raise exception 'Code de caisse incorrect.';
  end if;
  delete from public.caisse_clotures where date_cloture = p_date;
  return true;
end;
$$;

create or replace function public.fn_caisse_valider_mouvement(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.gm_role() not in ('admin','gerant') then
    raise exception 'Seul un administrateur ou le gérant peut valider une saisie de caisse.';
  end if;
  update public.caisse_mouvements set valide = true, valide_par = auth.uid(), valide_le = now()
   where id = p_id and valide = false;
  return true;
end;
$$;

create or replace function public.gm_caisse_mouvement_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_role text := public.gm_role();
begin
  if not exists (select 1 from public.caisse_ouvertures where date_ouverture = new.date_mouvement) then
    raise exception 'La caisse doit être ouverte (code requis) avant toute saisie.';
  end if;
  if exists (select 1 from public.caisse_clotures where date_cloture = new.date_mouvement) then
    raise exception 'Cette journée est clôturée.';
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if v_role in ('admin','gerant') then
    new.valide := true; new.valide_par := auth.uid(); new.valide_le := now();
  else
    new.valide := false; new.valide_par := null; new.valide_le := null;
  end if;
  return new;
end;
$$;
drop trigger if exists gm_caisse_mouvement_avant_insert on public.caisse_mouvements;
create trigger gm_caisse_mouvement_avant_insert before insert on public.caisse_mouvements
  for each row execute function public.gm_caisse_mouvement_avant_insert();

drop policy if exists caisse_mouvements_admin_all on public.caisse_mouvements;
drop policy if exists caisse_mouvements_comptable_insert on public.caisse_mouvements;
drop policy if exists caisse_mouvements_comptable_select_own on public.caisse_mouvements;
drop policy if exists caisse_mvt_select on public.caisse_mouvements;
create policy caisse_mvt_select on public.caisse_mouvements for select to authenticated
  using (public.gm_role() in ('admin','gerant') or (public.gm_role() = 'comptable' and created_by = auth.uid()));
drop policy if exists caisse_mvt_insert on public.caisse_mouvements;
create policy caisse_mvt_insert on public.caisse_mouvements for insert to authenticated
  with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists caisse_mvt_update_admin on public.caisse_mouvements;
create policy caisse_mvt_update_admin on public.caisse_mouvements for update to authenticated
  using (public.gm_role() = 'admin');
drop policy if exists caisse_mvt_delete on public.caisse_mouvements;
create policy caisse_mvt_delete on public.caisse_mouvements for delete to authenticated
  using (
    public.gm_role() = 'admin'
    or (valide = false and (public.gm_role() = 'gerant' or created_by = auth.uid()))
  );

drop policy if exists caisse_clotures_admin_all on public.caisse_clotures;
drop policy if exists caisse_clotures_select on public.caisse_clotures;
create policy caisse_clotures_select on public.caisse_clotures for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));

create table if not exists public.recettes (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  facture_id bigint references public.factures(id) on delete set null,
  facture_numero text,
  client_nom text,
  date_recette date not null default current_date,
  montant numeric(14,2) not null check (montant > 0),
  mode_paiement text not null default 'especes' check (mode_paiement in ('especes','virement','cheque','mobile_money','carte')),
  reference text,
  caisse_mouvement_id uuid references public.caisse_mouvements(id) on delete set null,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists recettes_date_idx on public.recettes (date_recette);
create index if not exists recettes_facture_idx on public.recettes (facture_id);
alter table public.recettes enable row level security;
drop policy if exists recettes_select on public.recettes;
create policy recettes_select on public.recettes for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists recettes_insert on public.recettes;
create policy recettes_insert on public.recettes for insert to authenticated
  with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists recettes_update on public.recettes;
create policy recettes_update on public.recettes for update to authenticated
  using (public.gm_role() in ('admin','gerant'));
drop policy if exists recettes_delete on public.recettes;
create policy recettes_delete on public.recettes for delete to authenticated
  using (public.gm_role() = 'admin');

create or replace function public.fn_recette_enregistrer(
  p_facture_id bigint,
  p_date date,
  p_montant numeric,
  p_mode text,
  p_reference text default null,
  p_notes text default null,
  p_client_nom text default null
)
returns public.recettes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.gm_role();
  v_fact public.factures;
  v_annee text := to_char(coalesce(p_date, current_date), 'YYYY');
  v_seq int;
  v_numero text;
  v_mvt_id uuid;
  v_row public.recettes;
  v_total_encaisse numeric;
  v_client text := p_client_nom;
begin
  if v_role not in ('admin','gerant','comptable') then
    raise exception 'Accès refusé.';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide.';
  end if;
  if p_facture_id is not null then
    select * into v_fact from public.factures where id = p_facture_id and type = 'facture';
    if not found then
      raise exception 'Facture introuvable.';
    end if;
    v_client := coalesce(v_client, v_fact.client_nom);
  end if;
  select coalesce(max((regexp_match(numero, '^REC-' || v_annee || '-(\d+)$'))[1]::int), 0) + 1 into v_seq
    from public.recettes where numero like 'REC-' || v_annee || '-%';
  v_numero := 'REC-' || v_annee || '-' || lpad(v_seq::text, 4, '0');

  if p_mode = 'especes' then
    if not exists (select 1 from public.caisse_ouvertures where date_ouverture = p_date) then
      raise exception 'La caisse doit être ouverte le % pour enregistrer un encaissement en espèces.', to_char(p_date, 'DD/MM/YYYY');
    end if;
    if exists (select 1 from public.caisse_clotures where date_cloture = p_date) then
      raise exception 'La caisse du % est clôturée.', to_char(p_date, 'DD/MM/YYYY');
    end if;
    insert into public.caisse_mouvements (date_mouvement, type, montant, categorie, motif, created_by, facture_id)
    values (p_date, 'entree', p_montant, 'Règlement client',
            coalesce('Encaissement ' || v_numero || ' - ' || coalesce(v_fact.numero, v_client), 'Encaissement ' || v_numero),
            auth.uid(), p_facture_id)
    returning id into v_mvt_id;
  end if;

  insert into public.recettes (numero, facture_id, facture_numero, client_nom, date_recette, montant, mode_paiement, reference, caisse_mouvement_id, notes, created_by)
  values (v_numero, p_facture_id, v_fact.numero, v_client, p_date, p_montant, p_mode, nullif(trim(coalesce(p_reference,'')), ''), v_mvt_id, nullif(trim(coalesce(p_notes,'')), ''), auth.uid())
  returning * into v_row;

  if v_mvt_id is not null then
    update public.caisse_mouvements set recette_id = v_row.id where id = v_mvt_id;
  end if;

  if p_facture_id is not null then
    select coalesce(sum(montant), 0) into v_total_encaisse from public.recettes where facture_id = p_facture_id;
    if v_total_encaisse >= v_fact.total_ttc - 1 then
      update public.factures set statut = 'payee', updated_at = now() where id = p_facture_id;
    end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.fn_recette_supprimer(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.recettes;
begin
  if public.gm_role() <> 'admin' then
    raise exception 'Seul un administrateur peut supprimer un encaissement.';
  end if;
  select * into v_row from public.recettes where id = p_id;
  if not found then return false; end if;
  if v_row.caisse_mouvement_id is not null then
    if exists (select 1 from public.caisse_clotures c join public.caisse_mouvements m on m.date_mouvement = c.date_cloture where m.id = v_row.caisse_mouvement_id) then
      raise exception 'La journée de caisse liée est clôturée : rouvrez-la d''abord.';
    end if;
    delete from public.caisse_mouvements where id = v_row.caisse_mouvement_id;
  end if;
  delete from public.recettes where id = p_id;
  if v_row.facture_id is not null then
    update public.factures set statut = 'attente', updated_at = now()
     where id = v_row.facture_id and statut = 'payee'
       and coalesce((select sum(montant) from public.recettes where facture_id = v_row.facture_id), 0) < total_ttc - 1;
  end if;
  return true;
end;
$$;

alter table public.bons_commande add column if not exists devise text not null default 'FCFA';
alter table public.bons_commande add column if not exists date_envoi date;
alter table public.bons_commande add column if not exists date_confirmation date;
alter table public.bons_commande add column if not exists date_expedition date;
alter table public.bons_commande add column if not exists date_arrivee date;
alter table public.bons_commande add column if not exists date_dedouanement date;
alter table public.bons_commande add column if not exists transporteur text;
alter table public.bons_commande add column if not exists numero_bl text;
alter table public.bons_commande add column if not exists numero_tracking text;
alter table public.bons_commande add column if not exists numero_declaration_douane text;
alter table public.bons_commande add column if not exists transitaire text;
alter table public.bons_commande add column if not exists incoterm text;
alter table public.bons_commande add column if not exists commentaire_suivi text;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.bons_commande'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%statut%'
  loop
    execute format('alter table public.bons_commande drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.bons_commande add constraint bons_commande_statut_check
  check (statut in ('brouillon','envoye','confirme','expedie','arrive','dedouane','recu','annule'));

create table if not exists public.bon_commande_documents (
  id uuid primary key default gen_random_uuid(),
  bon_commande_id bigint not null references public.bons_commande(id) on delete cascade,
  type text not null check (type in ('facture_fournisseur','preuve_paiement','facture_douane','facture_transit','facture_transport','bill_of_lading','lta','packing_list','certificat','declaration_douane','autre')),
  nom text not null,
  path text not null,
  taille bigint,
  mime text,
  reference text,
  montant numeric(14,2),
  devise text default 'FCFA',
  date_document date,
  date_echeance date,
  paye boolean not null default false,
  date_paiement date,
  mode_paiement text,
  notes text,
  uploaded_by uuid,
  created_at timestamptz default now()
);
create index if not exists bcd_bon_idx on public.bon_commande_documents (bon_commande_id);
alter table public.bon_commande_documents enable row level security;
drop policy if exists bcd_select on public.bon_commande_documents;
create policy bcd_select on public.bon_commande_documents for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable','logistique'));
drop policy if exists bcd_write on public.bon_commande_documents;
create policy bcd_write on public.bon_commande_documents for insert to authenticated
  with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists bcd_update on public.bon_commande_documents;
create policy bcd_update on public.bon_commande_documents for update to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists bcd_delete on public.bon_commande_documents;
create policy bcd_delete on public.bon_commande_documents for delete to authenticated
  using (public.gm_role() in ('admin','gerant') or (public.gm_role() = 'comptable' and uploaded_by = auth.uid()));

create table if not exists public.bon_commande_etapes (
  id bigserial primary key,
  bon_commande_id bigint not null references public.bons_commande(id) on delete cascade,
  etape text not null,
  date_etape date not null default current_date,
  commentaire text,
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists bce_bon_idx on public.bon_commande_etapes (bon_commande_id, created_at);
alter table public.bon_commande_etapes enable row level security;
drop policy if exists bce_select on public.bon_commande_etapes;
create policy bce_select on public.bon_commande_etapes for select to authenticated using (true);
drop policy if exists bce_insert on public.bon_commande_etapes;
create policy bce_insert on public.bon_commande_etapes for insert to authenticated
  with check (public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists bce_delete on public.bon_commande_etapes;
create policy bce_delete on public.bon_commande_etapes for delete to authenticated
  using (public.gm_role() = 'admin');

insert into storage.buckets (id, name, public) values ('commandes', 'commandes', false)
on conflict (id) do nothing;
drop policy if exists commandes_select on storage.objects;
create policy commandes_select on storage.objects for select to authenticated
  using (bucket_id = 'commandes' and public.gm_role() in ('admin','gerant','comptable','logistique'));
drop policy if exists commandes_insert on storage.objects;
create policy commandes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'commandes' and public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists commandes_update on storage.objects;
create policy commandes_update on storage.objects for update to authenticated
  using (bucket_id = 'commandes' and public.gm_role() in ('admin','gerant','comptable'));
drop policy if exists commandes_delete on storage.objects;
create policy commandes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'commandes' and public.gm_role() in ('admin','gerant','comptable'));

create or replace view public.v_bons_commande_paiement with (security_invoker = true) as
select b.id as bon_commande_id,
       count(d.id) filter (where d.type in ('facture_fournisseur','facture_douane','facture_transit','facture_transport')) as nb_factures,
       count(d.id) filter (where d.type in ('facture_fournisseur','facture_douane','facture_transit','facture_transport') and d.paye) as nb_payees,
       coalesce(sum(d.montant) filter (where d.type in ('facture_fournisseur','facture_douane','facture_transit','facture_transport')), 0) as total_factures,
       coalesce(sum(d.montant) filter (where d.type in ('facture_fournisseur','facture_douane','facture_transit','facture_transport') and d.paye), 0) as total_paye,
       count(d.id) as nb_documents
from public.bons_commande b
left join public.bon_commande_documents d on d.bon_commande_id = b.id
group by b.id;
grant select on public.v_bons_commande_paiement to authenticated;

update public.caisse_mouvements set valide = true where valide = false and date_mouvement < current_date;
insert into public.caisse_ouvertures (date_ouverture, solde_ouverture, ouvert_par)
select m.date_mouvement, 0, null from public.caisse_mouvements m
where not exists (select 1 from public.caisse_ouvertures o where o.date_ouverture = m.date_mouvement)
group by m.date_mouvement
on conflict (date_ouverture) do nothing;

create or replace function public.fn_recette_rattacher(p_mouvement_id uuid, p_facture_id bigint, p_notes text default null)
returns public.recettes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mvt public.caisse_mouvements;
  v_fact public.factures;
  v_annee text;
  v_seq int;
  v_numero text;
  v_row public.recettes;
  v_total numeric;
begin
  if public.gm_role() not in ('admin','gerant') then
    raise exception 'Seul un administrateur ou le gérant peut rattacher une entrée de caisse.';
  end if;
  select * into v_mvt from public.caisse_mouvements where id = p_mouvement_id for update;
  if not found or v_mvt.type <> 'entree' then
    raise exception 'Entrée de caisse introuvable.';
  end if;
  if v_mvt.recette_id is not null then
    raise exception 'Cette entrée de caisse est déjà rattachée à une recette.';
  end if;
  if p_facture_id is not null then
    select * into v_fact from public.factures where id = p_facture_id and type = 'facture';
    if not found then raise exception 'Facture introuvable.'; end if;
  end if;
  v_annee := to_char(v_mvt.date_mouvement, 'YYYY');
  select coalesce(max((regexp_match(numero, '^REC-' || v_annee || '-(\d+)$'))[1]::int), 0) + 1 into v_seq
    from public.recettes where numero like 'REC-' || v_annee || '-%';
  v_numero := 'REC-' || v_annee || '-' || lpad(v_seq::text, 4, '0');
  insert into public.recettes (numero, facture_id, facture_numero, client_nom, date_recette, montant, mode_paiement, caisse_mouvement_id, notes, created_by)
  values (v_numero, p_facture_id, v_fact.numero, coalesce(v_fact.client_nom, v_mvt.motif), v_mvt.date_mouvement, v_mvt.montant, 'especes', v_mvt.id,
          coalesce(nullif(trim(coalesce(p_notes,'')), ''), 'Rattachement entrée de caisse : ' || coalesce(v_mvt.motif, '')), auth.uid())
  returning * into v_row;
  update public.caisse_mouvements set recette_id = v_row.id, facture_id = p_facture_id where id = v_mvt.id;
  if p_facture_id is not null then
    select coalesce(sum(montant), 0) into v_total from public.recettes where facture_id = p_facture_id;
    if v_total >= v_fact.total_ttc - 1 then
      update public.factures set statut = 'payee', updated_at = now() where id = p_facture_id;
    end if;
  end if;
  return v_row;
end;
$$;

revoke all on function public.fn_caisse_verifier_code(text) from public, anon;
revoke all on function public.fn_caisse_definir_code(text, text) from public, anon;
revoke all on function public.fn_caisse_ouvrir(text, date) from public, anon;
revoke all on function public.fn_caisse_cloturer(text, date, numeric, text) from public, anon;
revoke all on function public.fn_caisse_rouvrir(text, date) from public, anon;
revoke all on function public.fn_caisse_valider_mouvement(uuid) from public, anon;
revoke all on function public.fn_recette_enregistrer(bigint, date, numeric, text, text, text, text) from public, anon;
revoke all on function public.fn_recette_supprimer(uuid) from public, anon;
revoke all on function public.fn_recette_rattacher(uuid, bigint, text) from public, anon;
grant execute on function public.fn_caisse_verifier_code(text) to authenticated;
grant execute on function public.fn_caisse_definir_code(text, text) to authenticated;
grant execute on function public.fn_caisse_ouvrir(text, date) to authenticated;
grant execute on function public.fn_caisse_cloturer(text, date, numeric, text) to authenticated;
grant execute on function public.fn_caisse_rouvrir(text, date) to authenticated;
grant execute on function public.fn_caisse_valider_mouvement(uuid) to authenticated;
grant execute on function public.fn_recette_enregistrer(bigint, date, numeric, text, text, text, text) to authenticated;
grant execute on function public.fn_recette_supprimer(uuid) to authenticated;
grant execute on function public.fn_recette_rattacher(uuid, bigint, text) to authenticated;

update public.caisse_ouvertures o
   set solde_ouverture = coalesce(c.solde_ouverture, (
         select coalesce(p.solde_reel, p.solde_theorique, 0) from public.caisse_clotures p
          where p.date_cloture < o.date_ouverture order by p.date_cloture desc limit 1), 0)
  from (select o2.id, cl.solde_ouverture from public.caisse_ouvertures o2
          left join public.caisse_clotures cl on cl.date_cloture = o2.date_ouverture) c
 where c.id = o.id and o.ouvert_par is null;

revoke execute on function public.fn_caisse_verifier_code(text) from authenticated;
