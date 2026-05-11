-- ============================================================
-- MIGRATION : Table parametres (informations societe)
-- A executer dans Supabase > SQL Editor
-- ============================================================

-- 1) Creer la table parametres
create table if not exists public.parametres (
  id bigserial primary key,
  societe_nom text default 'Galerie Medicale',
  societe_soustitre text default 'BY SAJ GROUPE',
  adresse text default 'Gallerie Oceane, Libreville, Gabon',
  telephone text default '(00241) 60202900',
  email text default 'acceuil@sajgroupe.com',
  site_web text default 'www.sajgroupe.com',
  nif text default '49761L',
  rccm text default 'GA-LBV-01-2020-B12-00179',
  capital text default '10 000 000',
  banque_nom text default 'ORABANK',
  banque_compte text default '40021 01000 21953600201 25',
  tva_taux text default '18',
  css_taux text default '1',
  delai_paiement text default '30',
  penalites text default '1,5',
  mention_proforma text default 'Document non fiscal - Valable 30 jours - Ne vaut pas engagement de paiement',
  mention_facture text default 'Toute facture non contestee dans 8 jours est reputee acceptee.',
  updated_at timestamptz default now()
);

-- 2) Inserer une ligne par defaut si la table est vide
insert into public.parametres (societe_nom)
select 'Galerie Medicale'
where not exists (select 1 from public.parametres);

-- 3) Activer RLS et autoriser lecture pour tous les utilisateurs connectes
alter table public.parametres enable row level security;

drop policy if exists "lecture_parametres" on public.parametres;
create policy "lecture_parametres" on public.parametres
  for select to authenticated using (true);

-- 4) Autoriser l'ecriture aux admins uniquement
drop policy if exists "ecriture_parametres" on public.parametres;
create policy "ecriture_parametres" on public.parametres
  for all to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and actif = true
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and actif = true
  ));

-- 5) Verification
select 'Table parametres creee avec succes' as message, count(*) as nb_lignes
from public.parametres;
