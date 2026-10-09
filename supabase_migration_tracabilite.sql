alter table public.factures add column if not exists created_by uuid;
alter table public.factures add column if not exists valide boolean default false;
alter table public.factures add column if not exists valide_par uuid;
alter table public.factures add column if not exists date_validation timestamptz;
alter table public.factures add column if not exists modifie_par uuid;
alter table public.factures add column if not exists modifie_le timestamptz;

create table if not exists public.document_historique (
  id bigserial primary key,
  table_nom text not null,
  document_id bigint,
  numero text,
  type_document text,
  action text not null,
  details jsonb,
  utilisateur_id uuid,
  utilisateur_nom text,
  created_at timestamptz not null default now()
);

create index if not exists document_historique_doc_idx on public.document_historique (table_nom, document_id, created_at desc);
create index if not exists document_historique_date_idx on public.document_historique (created_at desc);

alter table public.document_historique enable row level security;

drop policy if exists "historique_lecture" on public.document_historique;
create policy "historique_lecture" on public.document_historique
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','comptable')));

create or replace function public.gm_nom_utilisateur(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select nom from public.profiles where id = uid), case when uid is null then 'Système' else 'Utilisateur inconnu' end)
$$;

create or replace function public.gm_factures_avant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff_cles text[];
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.modifie_par := null;
    new.modifie_le := null;
    if coalesce(new.valide, false) then
      new.valide_par := coalesce(auth.uid(), new.valide_par);
      new.date_validation := coalesce(new.date_validation, now());
    end if;
    return new;
  end if;

  if coalesce(new.valide, false) and not coalesce(old.valide, false) then
    new.valide_par := coalesce(auth.uid(), new.valide_par);
    new.date_validation := now();
  end if;

  if not coalesce(new.valide, false) and coalesce(old.valide, false) then
    new.valide_par := null;
    new.date_validation := null;
  end if;

  select array_agg(n.key) into diff_cles
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('modifie_par','modifie_le','updated_at','valide','valide_par','date_validation');

  if diff_cles is not null then
    new.modifie_par := coalesce(auth.uid(), old.modifie_par);
    new.modifie_le := now();
  else
    new.modifie_par := old.modifie_par;
    new.modifie_le := old.modifie_le;
  end if;

  return new;
end;
$$;

create or replace function public.gm_factures_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  diff jsonb;
  cles text[];
  act text;
begin
  if tg_op = 'INSERT' then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    values ('factures', new.id, new.numero, new.type, 'creation',
      jsonb_build_object('client', new.client_nom, 'total_ttc', new.total_ttc),
      uid, public.gm_nom_utilisateur(uid));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    values ('factures', old.id, old.numero, old.type, 'suppression',
      jsonb_build_object('client', old.client_nom, 'total_ttc', old.total_ttc, 'valide', coalesce(old.valide, false)),
      uid, public.gm_nom_utilisateur(uid));
    return old;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('avant', o.value, 'apres', n.value)), array_agg(n.key)
  into diff, cles
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('modifie_par','modifie_le','updated_at','valide','valide_par','date_validation');

  if coalesce(new.valide, false) and not coalesce(old.valide, false) then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    values ('factures', new.id, new.numero, new.type, 'validation', null, uid, public.gm_nom_utilisateur(uid));
  elsif not coalesce(new.valide, false) and coalesce(old.valide, false) then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    values ('factures', new.id, new.numero, new.type, 'devalidation', null, uid, public.gm_nom_utilisateur(uid));
  end if;

  if diff is not null then
    if cles = array['statut'] then
      act := 'statut';
    else
      act := 'modification';
    end if;
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    values ('factures', new.id, new.numero, new.type, act, diff, uid, public.gm_nom_utilisateur(uid));
  end if;

  return new;
end;
$$;

create or replace function public.gm_lignes_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    select 'factures', l.facture_id, f.numero, f.type, 'lignes_ajoutees',
      jsonb_build_object('lignes', jsonb_agg(jsonb_build_object('designation', l.designation, 'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire) order by l.ordre, l.id)),
      uid, public.gm_nom_utilisateur(uid)
    from nouvelles_lignes l
    left join public.factures f on f.id = l.facture_id
    group by l.facture_id, f.numero, f.type;
  elsif tg_op = 'DELETE' then
    insert into public.document_historique (table_nom, document_id, numero, type_document, action, details, utilisateur_id, utilisateur_nom)
    select 'factures', l.facture_id, f.numero, f.type, 'lignes_supprimees',
      jsonb_build_object('lignes', jsonb_agg(jsonb_build_object('designation', l.designation, 'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire) order by l.ordre, l.id)),
      uid, public.gm_nom_utilisateur(uid)
    from anciennes_lignes l
    join public.factures f on f.id = l.facture_id
    group by l.facture_id, f.numero, f.type;
  end if;
  return null;
end;
$$;

drop trigger if exists gm_factures_avant on public.factures;
create trigger gm_factures_avant
  before insert or update on public.factures
  for each row execute function public.gm_factures_avant();

drop trigger if exists gm_factures_journal on public.factures;
create trigger gm_factures_journal
  after insert or update or delete on public.factures
  for each row execute function public.gm_factures_journal();

drop trigger if exists gm_lignes_journal_ins on public.facture_lignes;
create trigger gm_lignes_journal_ins
  after insert on public.facture_lignes
  referencing new table as nouvelles_lignes
  for each statement execute function public.gm_lignes_journal();

drop trigger if exists gm_lignes_journal_del on public.facture_lignes;
create trigger gm_lignes_journal_del
  after delete on public.facture_lignes
  referencing old table as anciennes_lignes
  for each statement execute function public.gm_lignes_journal();
