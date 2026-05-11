-- ============================================================
-- GALERIE MEDICALE - Schema Supabase
-- Copiez-collez ce code dans Supabase > SQL Editor > New Query
-- Cliquez ensuite sur "Run"
-- ============================================================

-- TABLE : profils utilisateurs
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  nom text not null,
  email text not null,
  role text not null default 'comptable' check (role in ('admin','comptable','livreur')),
  actif boolean default true,
  created_at timestamptz default now()
);

-- TABLE : produits
create table if not exists public.produits (
  id bigserial primary key,
  reference text not null,
  designation text not null,
  categorie text not null default 'CONSOMMABLE',
  unite text not null default 'PIECE',
  prix_ht numeric(12,2) not null default 0,
  exonere_tva boolean not null default false,
  tva numeric(12,2) generated always as (case when exonere_tva then 0 else prix_ht * 0.18 end) stored,
  css numeric(12,2) generated always as (case when exonere_tva then 0 else prix_ht * 0.01 end) stored,
  prix_ttc numeric(12,2) generated always as (case when exonere_tva then prix_ht else prix_ht * 1.19 end) stored,
  actif boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TABLE : clients
create table if not exists public.clients (
  id bigserial primary key,
  nom text not null,
  adresse text,
  ville text default 'Libreville',
  pays text default 'Gabon',
  telephone text,
  nif text,
  email text,
  created_at timestamptz default now()
);

-- TABLE : factures
create table if not exists public.factures (
  id bigserial primary key,
  numero text not null unique,
  type text not null default 'facture' check (type in ('facture','proforma')),
  client_id bigint references public.clients(id),
  client_nom text not null,
  client_adresse text,
  client_nif text,
  objet text,
  date_emission date not null default current_date,
  date_echeance date,
  remise_pct numeric(5,2) default 0,
  sous_total_ht numeric(12,2) default 0,
  montant_remise numeric(12,2) default 0,
  base_ht numeric(12,2) default 0,
  tva numeric(12,2) default 0,
  css numeric(12,2) default 0,
  total_ttc numeric(12,2) default 0,
  statut text default 'attente' check (statut in ('attente','payee','retard','en_cours','expiree')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TABLE : lignes de facture
create table if not exists public.facture_lignes (
  id bigserial primary key,
  facture_id bigint references public.factures(id) on delete cascade,
  produit_id bigint references public.produits(id),
  designation text not null,
  quantite numeric(10,2) not null default 1,
  prix_unitaire numeric(12,2) not null default 0,
  exonere_tva boolean not null default false,
  total_ht numeric(12,2) generated always as (quantite * prix_unitaire) stored,
  ordre int default 0
);

-- TABLE : bons de livraison
create table if not exists public.bons_livraison (
  id bigserial primary key,
  numero text not null unique,
  facture_id bigint references public.factures(id),
  client_nom text not null,
  date_livraison date,
  livreur text,
  statut text default 'attente' check (statut in ('attente','partiel','complet')),
  remarques text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- TABLE : lignes bon de livraison
create table if not exists public.bl_lignes (
  id bigserial primary key,
  bl_id bigint references public.bons_livraison(id) on delete cascade,
  designation text not null,
  qte_commandee numeric(10,2) default 0,
  qte_livree numeric(10,2) default 0,
  unite text default 'Forfait',
  statut_ligne text default 'attente' check (statut_ligne in ('attente','livre','non_livre')),
  observation text
);

-- ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.produits enable row level security;
alter table public.clients enable row level security;
alter table public.factures enable row level security;
alter table public.facture_lignes enable row level security;
alter table public.bons_livraison enable row level security;
alter table public.bl_lignes enable row level security;

-- Policies lecture : tous les utilisateurs connectes peuvent lire
create policy "lecture_produits" on public.produits for select to authenticated using (true);
create policy "lecture_clients" on public.clients for select to authenticated using (true);
create policy "lecture_factures" on public.factures for select to authenticated using (true);
create policy "lecture_facture_lignes" on public.facture_lignes for select to authenticated using (true);
create policy "lecture_bons_livraison" on public.bons_livraison for select to authenticated using (true);
create policy "lecture_bl_lignes" on public.bl_lignes for select to authenticated using (true);
create policy "lecture_profil" on public.profiles for select to authenticated using (true);

-- Policies ecriture : admin et comptable
create policy "ecriture_produits" on public.produits for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','comptable') and actif = true));

create policy "ecriture_clients" on public.clients for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','comptable') and actif = true));

create policy "ecriture_factures" on public.factures for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','comptable') and actif = true));

create policy "ecriture_facture_lignes" on public.facture_lignes for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','comptable') and actif = true));

-- Policies ecriture : tous les roles actifs pour les BL
create policy "ecriture_bons_livraison" on public.bons_livraison for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and actif = true));

create policy "ecriture_bl_lignes" on public.bl_lignes for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and actif = true));

-- Policies profils : admin seulement pour modifier
create policy "ecriture_profiles" on public.profiles for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- TRIGGER : creer le profil automatiquement a l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nom, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'comptable')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- DONNEES DE DEMO : produits pre-charges
insert into public.produits (reference, designation, categorie, unite, prix_ht) values
  ('GM-001', 'LIGNE DE BRANCHEMENT', 'CONSOMMABLE', 'PIECE', 45000),
  ('GM-002', 'AIGUILLE A FISTULE AVF', 'CONSOMMABLE', 'PIECE', 12000),
  ('GM-003', 'DIALYSEUR', 'CONSOMMABLE', 'PIECE', 85000),
  ('GM-004', 'SET ON / OFF', 'CONSOMMABLE', 'PIECE', 8500),
  ('GM-005', 'ACIDE BIDON 10 L', 'CONSOMMABLE', 'PIECE', 15000),
  ('GM-006', 'BICART CARTOUCHE', 'CONSOMMABLE', 'PIECE', 22000),
  ('GM-007', 'SERUM SALE 1 L', 'CONSOMMABLE', 'PIECE', 3500),
  ('GM-011', 'LIT HOSPITALISATION ELECTRIQUE 2 FONCTIONS', 'EQUIPEMENT', 'Forfait', 850000),
  ('GM-012', 'LIT HOSPITALISATION MANUEL 3 FONCTIONS', 'EQUIPEMENT', 'Forfait', 650000),
  ('GM-018', 'FAUTEUIL DIALYSE ELECTRIQUE', 'EQUIPEMENT', 'Forfait', 750000),
  ('GM-019', 'LAMPE OPERATION MOBILE', 'EQUIPEMENT', 'Forfait', 420000),
  ('GM-020', 'CHARIOT URGENCE BT-B20', 'EQUIPEMENT', 'Forfait', 280000)
on conflict do nothing;

-- Verification finale
select 'Schema installe avec succes !' as message;
