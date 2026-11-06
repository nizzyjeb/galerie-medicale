alter table public.employes add column if not exists date_naissance date;
alter table public.employes add column if not exists sexe text default 'M';
alter table public.employes add column if not exists nationalite text default 'GAB';
alter table public.employes add column if not exists classification text;
alter table public.employes add column if not exists categorie text;
alter table public.employes add column if not exists section text;
alter table public.employes add column if not exists service text;
alter table public.employes add column if not exists regime text default 'G';
alter table public.employes add column if not exists statut_salarie text default 'E';
alter table public.employes add column if not exists nb_parts_force numeric(4,1);
alter table public.employes add column if not exists rubriques jsonb not null default '[]'::jsonb;
alter table public.employes add column if not exists cumuls_reprise jsonb;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.employes'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%situation_familiale%'
  loop
    execute format('alter table public.employes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.employes add constraint employes_situation_familiale_check
  check (situation_familiale in ('celibataire','marie','divorce','veuf'));

alter table public.bulletins_paie add column if not exists rubriques jsonb not null default '[]'::jsonb;
alter table public.bulletins_paie add column if not exists lignes jsonb not null default '[]'::jsonb;
alter table public.bulletins_paie add column if not exists anciennete_taux numeric(5,2);
alter table public.bulletins_paie add column if not exists base_cnss numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists base_cnamgs numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists base_tcs numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists base_irpp numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists salaire_net_imposable numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists indemnites_non_soumises numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists total_gains numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists reprise_arrondi numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists arrondi numeric(14,2) default 0;
alter table public.bulletins_paie add column if not exists billetage jsonb;
alter table public.bulletins_paie add column if not exists employe_snapshot jsonb;

alter table public.parametres_paie add column if not exists arrondi_paie integer default 100;
alter table public.parametres_paie add column if not exists anciennete_debut_annees numeric(4,1) default 2;
alter table public.parametres_paie add column if not exists anciennete_taux_annuel numeric(5,2) default 1;
alter table public.parametres_paie add column if not exists anciennete_max numeric(5,2) default 30;
alter table public.parametres_paie add column if not exists employeur_nom text default 'SAJ GROUPE';
alter table public.parametres_paie add column if not exists employeur_bp text default 'BP 3403';
alter table public.parametres_paie add column if not exists employeur_ville text default 'LIBREVILLE';
alter table public.parametres_paie add column if not exists employeur_stat text default '049761 L';
alter table public.parametres_paie add column if not exists employeur_cnss text default '014-0202406-V';

update public.parametres_paie set
  cnss_taux_salarie = 5,
  tcs_seuil_exoneration = 150000,
  frais_pro_pct = 20,
  irpp_bareme = '[
    {"jusqua": 1500000, "taux": 0},
    {"jusqua": 1920000, "taux": 5},
    {"jusqua": 2700000, "taux": 10},
    {"jusqua": 3600000, "taux": 15},
    {"jusqua": 5160000, "taux": 20},
    {"jusqua": 7500000, "taux": 25},
    {"jusqua": 11000000, "taux": 30},
    {"jusqua": null, "taux": 35}
  ]'::jsonb,
  arrondi_paie = coalesce(arrondi_paie, 100),
  updated_at = now();

drop policy if exists parametres_paie_select on public.parametres_paie;
create policy parametres_paie_select on public.parametres_paie for select to authenticated
  using (public.gm_role() in ('admin','gerant','comptable'));
