with t as (
  select f.id,
         coalesce(sum(round(l.quantite * l.prix_unitaire)), 0) as st,
         coalesce(sum(case when l.exonere_tva then 0 else round(l.quantite * l.prix_unitaire) end), 0) as st_tva
  from factures f
  left join facture_lignes l on l.facture_id = f.id
  group by f.id
),
c as (
  select t.id, t.st, t.st_tva,
         round(t.st * coalesce(f.remise_pct, 0) / 100) as remise,
         case when t.st > 0 then t.st_tva / t.st else 0 end as ratio
  from t join factures f on f.id = t.id
),
d as (
  select id, st, remise, (st - remise) as base,
         round(st_tva - remise * ratio) as base_tva
  from c
)
update factures f
set sous_total_ht = d.st,
    montant_remise = d.remise,
    base_ht = d.base,
    tva = round(d.base_tva * 0.18),
    css = round(d.base * 0.01),
    total_ttc = d.base + round(d.base_tva * 0.18) + round(d.base * 0.01)
from d
where f.id = d.id
  and exists (select 1 from facture_lignes l where l.facture_id = f.id);

select numero, sous_total_ht, montant_remise, base_ht, tva, css, total_ttc
from factures where numero like '%028-2026%';
