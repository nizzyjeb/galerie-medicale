import LOGO_BASE64 from '../lib/logo.js'
import { libellePeriode, MODES_PAIEMENT } from '../lib/paie'
import { montantEnLettres } from '../lib/utils'

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const num = (v) => Number(v) || 0

const STYLE = `
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; font-size: 11.5px; }
  .doc { max-width: 190mm; margin: 0 auto; }
  .doc + .doc { page-break-before: always; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1A9E8F; padding-bottom: 10px; }
  .head img { height: 64px; }
  .head .co { text-align: right; font-size: 10.5px; color: #475569; }
  .co .name { font-size: 14px; font-weight: 700; color: #1A9E8F; }
  .title { text-align: center; margin: 14px 0 4px; }
  .title h1 { color: #1A9E8F; margin: 0; font-size: 20px; letter-spacing: 1px; }
  .title .num { font-size: 12px; color: #475569; margin-top: 2px; }
  .meta { display: flex; gap: 14px; margin: 12px 0; }
  .box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 10px; }
  .box h3 { margin: 0 0 5px; font-size: 10.5px; text-transform: uppercase; color: #1A9E8F; letter-spacing: .5px; }
  .box p { margin: 2px 0; }
  .box b { color: #0f172a; }
  h2 { font-size: 11px; text-transform: uppercase; color: #fff; background: #1A9E8F; margin: 12px 0 0; padding: 5px 8px; letter-spacing: .5px; border-radius: 4px 4px 0 0; }
  table { width: 100%; border-collapse: collapse; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #eef2f5; }
  td.c { text-align: center; color: #64748b; width: 110px; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; width: 130px; }
  tr.total td { font-weight: 700; background: #f8fafc; }
  .net { margin-top: 14px; border: 2px solid #1A9E8F; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; }
  .net .lbl { font-size: 13px; font-weight: 700; color: #0f766e; }
  .net .val { font-size: 20px; font-weight: 800; color: #0f766e; }
  .lettres { font-size: 10.5px; color: #475569; font-style: italic; margin-top: 4px; }
  .cout { margin-top: 10px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; }
  .sign div { width: 45%; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10.5px; text-align: center; color: #475569; }
  .foot { margin-top: 18px; text-align: center; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  .badge { display: inline-block; background: #1A9E8F; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 10.5px; }
  .notes { margin-top: 10px; font-size: 10.5px; color: #475569; }
`

// Corps d'un bulletin (sans <html>) — permet d'imprimer plusieurs bulletins d'un coup
export function corpsBulletin(b, employe, societe, params) {
  const soc = societe || {}
  const emp = employe || {}
  const primes = Array.isArray(b.primes) ? b.primes : []
  const retenues = Array.isArray(b.retenues) ? b.retenues : []

  const lignesGains = [
    ['Salaire de base', `${fmt(b.jours_travailles)} / ${fmt(params?.jours_base || 30)} j`, b.salaire_base_calcule],
    ...(num(b.heures_sup_montant) > 0 ? [['Heures supplémentaires', '', b.heures_sup_montant]] : []),
    ...primes.map(p => [p.libelle + (p.imposable === false ? ' (non imposable)' : ''), '', p.montant]),
  ]

  const lignesRetenues = [
    ['CNSS part salariale', `${params?.cnss_taux_salarie ?? ''} %`, b.cnss_salarie],
    ['CNAMGS part salariale', `${params?.cnamgs_taux_salarie ?? ''} %`, b.cnamgs_salarie],
    ['IRPP (impôt sur le revenu)', `${num(b.nb_parts)} part(s)`, b.irpp],
    ['TCS (taxe complémentaire)', `${params?.tcs_taux ?? ''} %`, b.tcs],
    ...retenues.map(r => [r.libelle, '', r.montant]),
  ]

  const lignesEmployeur = [
    ['CNSS part patronale', `${params?.cnss_taux_employeur ?? ''} %`, b.cnss_employeur],
    ['CNAMGS part patronale', `${params?.cnamgs_taux_employeur ?? ''} %`, b.cnamgs_employeur],
    ...(num(b.fnh_employeur) > 0 ? [['FNH', `${params?.fnh_taux_employeur ?? ''} %`, b.fnh_employeur]] : []),
  ]

  const tr = (l) => `<tr><td>${esc(l[0])}</td><td class="c">${esc(l[1])}</td><td class="r">${fmt(l[2])}</td></tr>`

  return `<div class="doc">
  <div class="head">
    <img src="${LOGO_BASE64}" alt="logo" />
    <div class="co">
      <div class="name">${esc(soc.societe_nom || 'GALERIE MÉDICALE')} — ${esc(soc.societe_soustitre || 'SAJ GROUPE')}</div>
      <div>${esc(soc.adresse || 'Galerie Océane, Libreville, Gabon')}</div>
      <div>NIF : ${esc(soc.nif || '')} · RCCM : ${esc(soc.rccm || '')}</div>
      <div>${esc(soc.telephone || '')} · ${esc(soc.email || '')}</div>
    </div>
  </div>

  <div class="title">
    <h1>BULLETIN DE PAIE</h1>
    <div class="num">${esc(b.numero)} · Période : <b>${esc(libellePeriode(b.periode))}</b> · <span class="badge">${esc(b.statut === 'paye' ? 'Payé' : b.statut === 'valide' ? 'Validé' : 'Brouillon')}</span></div>
  </div>

  <div class="meta">
    <div class="box">
      <h3>Salarié</h3>
      <p><b>${esc(b.employe_nom)}</b></p>
      <p>Matricule : ${esc(b.employe_matricule || emp.matricule || '—')}</p>
      <p>Poste : ${esc(b.employe_poste || emp.poste || '—')}${emp.departement ? ' · ' + esc(emp.departement) : ''}</p>
      <p>Contrat : ${esc(emp.type_contrat || '—')} · Embauche : ${fmtDate(emp.date_embauche)}</p>
      <p>N° CNSS : ${esc(emp.cnss_numero || '—')} · N° CNAMGS : ${esc(emp.cnamgs_numero || '—')}</p>
    </div>
    <div class="box">
      <h3>Paiement</h3>
      <p>Situation : ${emp.situation_familiale === 'marie' ? 'Marié(e)' : 'Célibataire'} · ${num(emp.nb_enfants)} enfant(s) · ${num(b.nb_parts)} part(s)</p>
      <p>Mode : ${esc(MODES_PAIEMENT[b.mode_paiement || emp.mode_paiement] || b.mode_paiement || '—')}</p>
      <p>${emp.banque ? 'Banque : ' + esc(emp.banque) + ' · ' : ''}${emp.compte_bancaire ? 'Compte : ' + esc(emp.compte_bancaire) : ''}</p>
      <p>Date de paiement : <b>${fmtDate(b.date_paiement)}</b></p>
      <p>Jours travaillés : ${fmt(b.jours_travailles)} · Absences : ${fmt(b.jours_absence)} j</p>
    </div>
  </div>

  <h2>Gains</h2>
  <table><tbody>
    ${lignesGains.map(tr).join('')}
    <tr class="total"><td>SALAIRE BRUT</td><td class="c"></td><td class="r">${fmt(b.brut)}</td></tr>
  </tbody></table>

  <h2>Retenues salariales</h2>
  <table><tbody>
    <tr><td>Base imposable (après cotisations et ${esc(params?.frais_pro_pct ?? 20)} % de frais professionnels)</td><td class="c"></td><td class="r">${fmt(b.base_imposable)}</td></tr>
    ${lignesRetenues.map(tr).join('')}
    <tr class="total"><td>TOTAL DES RETENUES</td><td class="c"></td><td class="r">${fmt(b.total_retenues)}</td></tr>
  </tbody></table>

  <div class="net">
    <div>
      <div class="lbl">NET À PAYER</div>
      <div class="lettres">${esc(montantEnLettres(b.net_a_payer))}</div>
    </div>
    <div class="val">${fmt(b.net_a_payer)} FCFA</div>
  </div>

  <h2>Charges patronales (information)</h2>
  <table><tbody>
    ${lignesEmployeur.map(tr).join('')}
    <tr class="total"><td>TOTAL CHARGES PATRONALES</td><td class="c"></td><td class="r">${fmt(b.total_charges_employeur)}</td></tr>
  </tbody></table>
  <div class="cout"><span>Coût total employeur (brut + charges patronales)</span><b>${fmt(b.cout_total)} FCFA</b></div>

  ${b.notes ? `<div class="notes"><b>Observations :</b> ${esc(b.notes)}</div>` : ''}

  <div class="sign">
    <div>L'employeur</div>
    <div>Le salarié (pour acquit)</div>
  </div>

  <div class="foot">${esc(soc.societe_nom || 'Galerie Médicale')} · ${esc(soc.societe_soustitre || 'SAJ Groupe')} · ${esc(soc.adresse || 'Libreville, Gabon')} — Bulletin à conserver sans limitation de durée</div>
</div>`
}

const page = (titre, corps) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" /><title>${esc(titre)}</title><style>${STYLE}</style></head>
<body>${corps}
<script>window.onload = function(){ window.print(); }</script>
</body></html>`

export function htmlBulletin(b, employe, societe, params) {
  return page(`${b.numero} — ${b.employe_nom}`, corpsBulletin(b, employe, societe, params))
}

const ouvrir = (html) => {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

export function imprimerBulletin(b, employe, societe, params) {
  ouvrir(htmlBulletin(b, employe, societe, params))
}

// liste : [{ bulletin, employe }]
export function imprimerBulletins(liste, societe, params, titre = 'Bulletins de paie') {
  ouvrir(page(titre, liste.map(x => corpsBulletin(x.bulletin, x.employe, societe, params)).join('')))
}
