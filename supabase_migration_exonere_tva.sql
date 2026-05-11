-- ============================================================
-- MIGRATION : Exonération de TVA par type d'item
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1) Ajouter la colonne exonere_tva sur la table produits
alter table public.produits
  add column if not exists exonere_tva boolean not null default false;

-- 2) Recréer les colonnes générées tva/css/prix_ttc pour respecter exonere_tva
--    (les colonnes générées ne se modifient pas en place, on les drop / recrée)
alter table public.produits drop column if exists tva;
alter table public.produits drop column if exists css;
alter table public.produits drop column if exists prix_ttc;

alter table public.produits
  add column tva numeric(12,2)
    generated always as (case when exonere_tva then 0 else prix_ht * 0.18 end) stored;

alter table public.produits
  add column css numeric(12,2)
    generated always as (case when exonere_tva then 0 else prix_ht * 0.01 end) stored;

alter table public.produits
  add column prix_ttc numeric(12,2)
    generated always as (case when exonere_tva then prix_ht else prix_ht * 1.19 end) stored;

-- 3) Ajouter la colonne exonere_tva sur facture_lignes (mémorise le statut au moment de la facture)
alter table public.facture_lignes
  add column if not exists exonere_tva boolean not null default false;

-- 4) Vérification
select 'Migration TVA exonérée installée avec succès' as message;
