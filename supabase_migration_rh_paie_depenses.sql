create extension if not exists "uuid-ossp";

create or replace function public.gm_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create table if not exists public.employes (
  id bigserial primary key,
  matricule text unique,
  nom text not null,
  prenom text,
  poste text,
  departement text,
  type_contrat text default 'CDI' check (type_contrat in ('CDI','CDD','Stage','Prestataire','Journalier')),
  date_embauche date,
  date_fin date,
  salaire_base numeric(14,2) default 0,
  prime_transport numeric(14,2) default 0,
  prime_logement numeric(14,2) default 0,
  prime_autres numeric(14,2) default 0,
  situation_familiale text default 'celibataire' check (situation_familiale in ('celibataire','marie')),
  nb_enfants integer default 0,
  cnss_numero text,
  cnamgs_numero text,
  nif text,
  telephone text,
  email text,
  adresse text,
  banque text,
  compte_bancaire text,
  mode_paiement text default 'virement' check (mode_paiement in ('virement','especes','cheque','mobile_money')),
  user_id uuid references public.profiles(id) on delete set null,
  actif boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.parametres_paie (
  id bigserial primary key,
  cnss_taux_salarie numeric(6,3) default 2.5,
  cnss_taux_employeur numeric(6,3) default 16,
  cnss_plafond numeric(14,2) default 1500000,
  cnamgs_taux_salarie numeric(6,3) default 2,
  cnamgs_taux_employeur numeric(6,3) default 4.1,
  cnamgs_plafond numeric(14,2) default 2500000,
  fnh_taux_employeur numeric(6,3) default 2,
  frais_pro_pct numeric(6,3) default 20,
  tcs_taux numeric(6,3) default 5,
  tcs_seuil_exoneration numeric(14,2) default 150000,
  irpp_actif boolean default true,
  irpp_bareme jsonb default '[
    {"jusqua": 1500000, "taux": 0},
    {"jusqua": 1920000, "taux": 5},
    {"jusqua": 2500000, "taux": 10},
    {"jusqua": 3500000, "taux": 15},
    {"jusqua": 5000000, "taux": 20},
    {"jusqua": 7500000, "taux": 25},
    {"jusqua": 10000000, "taux": 30},
    {"jusqua": null, "taux": 35}
  ]'::jsonb,
  parts_max numeric(4,1) default 6,
  jours_base integer default 30,
  updated_at timestamptz default now()
);

insert into public.parametres_paie (id)
select 1 where not exists (select 1 from public.parametres_paie);

create table if not exists public.bulletins_paie (
  id bigserial primary key,
  numero text unique not null,
  employe_id bigint references public.employes(id) on delete set null,
  employe_nom text,
  employe_poste text,
  employe_matricule text,
  periode text not null,
  date_paiement date,
  jours_travailles numeric(5,2) default 30,
  jours_absence numeric(5,2) default 0,
  salaire_base numeric(14,2) default 0,
  salaire_base_calcule numeric(14,2) default 0,
  heures_sup_montant numeric(14,2) default 0,
  primes jsonb default '[]'::jsonb,
  retenues jsonb default '[]'::jsonb,
  brut numeric(14,2) default 0,
  brut_cotisable numeric(14,2) default 0,
  cnss_salarie numeric(14,2) default 0,
  cnamgs_salarie numeric(14,2) default 0,
  base_imposable numeric(14,2) default 0,
  irpp numeric(14,2) default 0,
  tcs numeric(14,2) default 0,
  autres_retenues numeric(14,2) default 0,
  total_retenues numeric(14,2) default 0,
  net_a_payer numeric(14,2) default 0,
  cnss_employeur numeric(14,2) default 0,
  cnamgs_employeur numeric(14,2) default 0,
  fnh_employeur numeric(14,2) default 0,
  total_charges_employeur numeric(14,2) default 0,
  cout_total numeric(14,2) default 0,
  nb_parts numeric(4,1) default 1,
  statut text default 'brouillon' check (statut in ('brouillon','valide','paye')),
  mode_paiement text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employe_id, periode)
);

create index if not exists bulletins_paie_periode_idx on public.bulletins_paie (periode);

create table if not exists public.categories_depenses (
  id bigserial primary key,
  nom text unique not null,
  actif boolean default true,
  created_at timestamptz default now()
);

insert into public.categories_depenses (nom) values
  ('Achats marchandises'),
  ('Transport & logistique'),
  ('Loyer & charges'),
  ('Electricite & eau'),
  ('Telephone & internet'),
  ('Carburant'),
  ('Entretien & reparations'),
  ('Fournitures de bureau'),
  ('Honoraires & prestations'),
  ('Frais bancaires'),
  ('Impots & taxes'),
  ('Salaires & charges sociales'),
  ('Marketing & communication'),
  ('Deplacements & missions'),
  ('Divers')
on conflict (nom) do nothing;

create table if not exists public.depenses (
  id bigserial primary key,
  numero text unique not null,
  type text not null default 'depense' check (type in ('depense','facture_fournisseur')),
  date_depense date not null default current_date,
  fournisseur_id text,
  fournisseur_nom text,
  reference_fournisseur text,
  categorie text,
  libelle text not null,
  montant_ht numeric(14,2) default 0,
  exonere_tva boolean default false,
  tva numeric(14,2) default 0,
  css numeric(14,2) default 0,
  montant_ttc numeric(14,2) default 0,
  date_echeance date,
  mode_paiement text default 'especes' check (mode_paiement in ('especes','virement','cheque','mobile_money','carte')),
  date_paiement date,
  statut text default 'brouillon' check (statut in ('brouillon','validee','payee','rejetee')),
  motif_rejet text,
  justificatif_path text,
  justificatif_nom text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_nom text,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists depenses_date_idx on public.depenses (date_depense);
create index if not exists depenses_statut_idx on public.depenses (statut);

alter table public.employes enable row level security;
alter table public.parametres_paie enable row level security;
alter table public.bulletins_paie enable row level security;
alter table public.categories_depenses enable row level security;
alter table public.depenses enable row level security;

drop policy if exists employes_select on public.employes;
create policy employes_select on public.employes for select to authenticated
  using (public.gm_role() in ('admin','comptable') or user_id = auth.uid());
drop policy if exists employes_admin on public.employes;
create policy employes_admin on public.employes for all to authenticated
  using (public.gm_role() = 'admin') with check (public.gm_role() = 'admin');

drop policy if exists parametres_paie_select on public.parametres_paie;
create policy parametres_paie_select on public.parametres_paie for select to authenticated
  using (public.gm_role() in ('admin','comptable'));
drop policy if exists parametres_paie_admin on public.parametres_paie;
create policy parametres_paie_admin on public.parametres_paie for all to authenticated
  using (public.gm_role() = 'admin') with check (public.gm_role() = 'admin');

drop policy if exists bulletins_select on public.bulletins_paie;
create policy bulletins_select on public.bulletins_paie for select to authenticated
  using (
    public.gm_role() in ('admin','comptable')
    or employe_id in (select id from public.employes where user_id = auth.uid())
  );
drop policy if exists bulletins_admin on public.bulletins_paie;
create policy bulletins_admin on public.bulletins_paie for all to authenticated
  using (public.gm_role() = 'admin') with check (public.gm_role() = 'admin');
drop policy if exists bulletins_comptable_insert on public.bulletins_paie;
create policy bulletins_comptable_insert on public.bulletins_paie for insert to authenticated
  with check (public.gm_role() = 'comptable' and statut = 'brouillon');
drop policy if exists bulletins_comptable_update on public.bulletins_paie;
create policy bulletins_comptable_update on public.bulletins_paie for update to authenticated
  using (public.gm_role() = 'comptable' and statut = 'brouillon')
  with check (public.gm_role() = 'comptable' and statut = 'brouillon');
drop policy if exists bulletins_comptable_delete on public.bulletins_paie;
create policy bulletins_comptable_delete on public.bulletins_paie for delete to authenticated
  using (public.gm_role() = 'comptable' and statut = 'brouillon');

drop policy if exists categories_select on public.categories_depenses;
create policy categories_select on public.categories_depenses for select to authenticated using (true);
drop policy if exists categories_admin on public.categories_depenses;
create policy categories_admin on public.categories_depenses for all to authenticated
  using (public.gm_role() = 'admin') with check (public.gm_role() = 'admin');

drop policy if exists depenses_select on public.depenses;
create policy depenses_select on public.depenses for select to authenticated
  using (public.gm_role() in ('admin','comptable'));
drop policy if exists depenses_admin on public.depenses;
create policy depenses_admin on public.depenses for all to authenticated
  using (public.gm_role() = 'admin') with check (public.gm_role() = 'admin');
drop policy if exists depenses_comptable_insert on public.depenses;
create policy depenses_comptable_insert on public.depenses for insert to authenticated
  with check (public.gm_role() = 'comptable' and statut = 'brouillon');
drop policy if exists depenses_comptable_update on public.depenses;
create policy depenses_comptable_update on public.depenses for update to authenticated
  using (public.gm_role() = 'comptable' and statut = 'brouillon')
  with check (public.gm_role() = 'comptable' and statut = 'brouillon');
drop policy if exists depenses_comptable_delete on public.depenses;
create policy depenses_comptable_delete on public.depenses for delete to authenticated
  using (public.gm_role() = 'comptable' and statut = 'brouillon' and created_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('justificatifs', 'justificatifs', false)
on conflict (id) do nothing;

drop policy if exists justificatifs_select on storage.objects;
create policy justificatifs_select on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','comptable'));
drop policy if exists justificatifs_insert on storage.objects;
create policy justificatifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.gm_role() in ('admin','comptable'));
drop policy if exists justificatifs_update on storage.objects;
create policy justificatifs_update on storage.objects for update to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','comptable'));
drop policy if exists justificatifs_delete on storage.objects;
create policy justificatifs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and public.gm_role() in ('admin','comptable'));
