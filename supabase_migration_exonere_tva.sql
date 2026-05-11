-- ============================================================
-- MIGRATION : Exoneration de TVA par type d'item
-- (CSS reste applique meme sur les items exoneres de TVA)
-- A executer dans Supabase > SQL Editor
-- ============================================================

-- 1) Ajouter la colonne exonere_tva sur la table produits
alter table public.produits
  add column if not exists exonere_tva boolean not null default false;

-- 2) Recreer les colonnes generees tva/css/prix_ttc
--    - tva = 0 si exonere, sinon prix_ht * 0.18
--    - css = TOUJOURS prix_ht * 0.01 (jamais exonere)
--    - prix_ttc = HT + TVA + CSS
alter table public.produits drop column if exists tva;
alter table public.produits drop column if exists css;
alter table public.produits drop column if exists prix_ttc;

alter table public.produits
  add column tva numeric(12,2)
    generated always as (case when exonere_tva then 0 else prix_ht * 0.18 end) stored;

alter table public.produits
  add column css numeric(12,2)
    generated always as (prix_ht * 0.01) stored;

alter table public.produits
  add column prix_ttc numeric(12,2)
    generated always as (case when exonere_tva then prix_ht * 1.01 else prix_ht * 1.19 end) stored;

-- 3) Ajouter la colonne exonere_tva sur facture_lignes
alter table public.facture_lignes
  add column if not exists exonere_tva boolean not null default false;

-- 4) Verification
select 'Migration TVA exoneree (CSS conservee) installee avec succes' as message;
