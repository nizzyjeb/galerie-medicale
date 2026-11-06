// Impression du bulletin de paie — reproduction du modèle SAJ GROUPE
import { MODES_PAIEMENT, SITUATIONS_COURT, debutDePeriode, finDePeriode, parametresComplets, calculerBilletage } from '../lib/paie'

const num = (v) => Number(v) || 0
// Format du bulletin : séparateur de milliers « . » (1.200.000)
const f = (v) => {
  if (v === null || v === undefined || v === '') return ''
  const x = Math.round(num(v))
  return (x < 0 ? '-' : '') + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
const fTaux = (v) => (v === null || v === undefined || v === '') ? '' : String(Number(v)).replace('.', ',')
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dCourt = (d) => {
  if (!d) return ''
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getFullYear()).slice(2)}`
}
const dLong = (x) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`
const moisMaj = (periode) => debutDePeriode(periode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase()

const TEAL = '#14937f'
const HAUTEUR_LIGNE = 4.9
const HAUTEUR_CORPS = 130

const STYLE = `
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc { width: 194mm; margin: 0 auto; border: 1.2px solid ${TEAL}; padding: 4mm 4mm 3mm; }
  .doc + .doc { page-break-before: always; margin-top: 8mm; }
  .mono { font-family: 'Courier New', Courier, monospace; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .emp { font-family: 'Courier New', Courier, monospace; font-size: 12.5px; line-height: 1.35; letter-spacing: .5px; }
  .titre { text-align: right; }
  .titre .t { color: ${TEAL}; font-size: 22px; font-weight: 700; letter-spacing: .5px; }
  .titre .m { color: ${TEAL}; font-size: 15px; font-weight: 700; margin-top: 8px; }
  .titre .m span { color: #1f2937; font-family: 'Courier New', monospace; font-weight: 400; font-size: 13px; margin-left: 8px; }
  .periode { font-family: 'Courier New', monospace; font-size: 12.5px; text-align: center; margin: 2px 0 4px; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; }
  .ident th { background: ${TEAL}; color: #fff; font-size: 9px; font-weight: 700; padding: 3px 2px; border: 1px solid ${TEAL}; text-transform: uppercase; }
  .ident td { font-family: 'Courier New', monospace; font-size: 12px; padding: 4px 4px; border: 1px solid ${TEAL}; height: 22px; white-space: nowrap; overflow: hidden; }
  .ident td.c { text-align: center; }
  .rub { margin-top: 0; }
  .rub th { background: ${TEAL}; color: #fff; font-size: 9.5px; font-weight: 700; padding: 3px 4px; border: 1px solid ${TEAL}; }
  .rub td { font-family: 'Courier New', monospace; font-size: 12.5px; padding: 0 5px; height: ${HAUTEUR_LIGNE}mm; border-left: 1px solid ${TEAL}; border-right: 1px solid ${TEAL}; border-top: none; border-bottom: none; white-space: nowrap; }
  .rub td.n { text-align: right; }
  .rub td.code { text-align: right; }
  .rub tr.rempl td { border-bottom: 1px solid ${TEAL}; }
  .tot { table-layout: fixed; }
  .tot td { font-family: 'Courier New', monospace; font-size: 13px; padding: 4px 5px; text-align: right; }
  .tot td.b { border: 1px solid ${TEAL}; border-top: none; }
  .net { display: flex; justify-content: center; align-items: center; gap: 10mm; margin: 4mm 0 3mm; }
  .net .lbl { background: ${TEAL}; color: #fff; font-weight: 700; font-size: 15px; padding: 5px 16px; }
  .net .fl { color: ${TEAL}; font-size: 26px; font-weight: 700; line-height: 1; }
  .net .val { background: #d4efe9; border: 1px solid ${TEAL}; font-family: 'Courier New', monospace; font-size: 15px; padding: 5px 12px; min-width: 52mm; text-align: right; }
  .bas { display: grid; grid-template-columns: 34% 18% 1fr 17%; border: 1px solid ${TEAL}; }
  .bas .h { background: ${TEAL}; color: #fff; font-size: 9.5px; font-weight: 700; text-align: center; padding: 3px; }
  .bas .col { border-right: 1px solid ${TEAL}; }
  .bas .col:last-child { border-right: none; }
  .bas .l { font-family: 'Courier New', monospace; font-size: 10.5px; padding: 1px 5px; white-space: nowrap; }
  .bas .r { text-align: right; }
  .emarg { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid ${TEAL}; height: 30mm; }
  .emarg div { font-size: 9.5px; color: ${TEAL}; font-weight: 700; text-align: center; padding-top: 3px; }
  .emarg div:first-child { border-right: 1px solid ${TEAL}; }
  .bill { display: grid; grid-template-columns: 1fr 9mm; }
  .obs { font-size: 10px; margin-top: 2mm; color: #475569; }
`

function lignesHtml(lignes) {
  return (lignes || []).map((l) => {
    const base = l.base !== undefined && l.base !== null ? f(l.base) : ''
    const nombre = l.nombre !== undefined && l.nombre !== null ? fTaux(l.nombre) : ''
    return `<tr><td class="code">${esc(l.code)}</td><td>${esc(l.libelle)}</td><td class="n">${base}</td><td class="n">${nombre}</td><td class="n">${l.gain ? f(l.gain) : ''}</td><td class="n">${l.retenue ? f(l.retenue) : ''}</td></tr>`
  }).join('')
}

// Corps d'un bulletin (sans <html>) — permet d'imprimer plusieurs bulletins d'un coup
export function corpsBulletin(b, employe, societe, params, cumuls = null) {
  const p = parametresComplets(params)
  const e = { ...(b.employe_snapshot || {}), ...(employe || {}) }
  const deb = debutDePeriode(b.periode)
  const fin = finDePeriode(b.periode)
  const mode = b.mode_paiement || e.mode_paiement || 'especes'
  const billetage = mode === 'especes' ? (Array.isArray(b.billetage) && b.billetage.length ? b.billetage : calculerBilletage(b.net_a_payer)) : []
  const nomEmp = (e.nom || (b.employe_nom || '').split(' ')[0] || '').toUpperCase()
  const prenomEmp = (e.prenom || (b.employe_nom || '').split(' ').slice(1).join(' ') || '').toUpperCase()
  const c = cumuls || {}

  const cumulLignes = [
    ['SALAIRE BRUT', c.brut],
    ['JOURS CNSS', c.jours],
    ['AVANTAGES NATURE CNSS', null],
    ['RETENUE PRECOMPTE CNSS', c.cnss],
    ['RETENUE PRECOMPTE CNAMGS', c.cnamgs],
    ['JOURS TCS/IRPP', c.jours],
    ['AVANTAGES NATURE TCS/IRPP', null],
    ['RETENUE PRECOMPTE TCS', c.tcs],
    ['RETENUE PRECOMPTE IRPP', c.irpp],
    ['NET PAYE', c.net],
  ]

  const modeLignes = [
    (MODES_PAIEMENT[mode] || mode || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(),
    ...(mode !== 'especes' && e.banque ? [String(e.banque).toUpperCase()] : []),
    ...(mode !== 'especes' && e.compte_bancaire ? [String(e.compte_bancaire)] : []),
    ...(b.date_paiement ? [`LE ${dLong(new Date(b.date_paiement))}`] : []),
  ]

  return `<div class="doc">
  <div class="top">
    <div class="emp">
      ${esc(p.employeur_nom)}<br/>
      ${esc(p.employeur_bp)}&nbsp;&nbsp;&nbsp;${esc(p.employeur_ville)}<br/>
      N°STAT : ${esc(p.employeur_stat)}<br/>
      N°CNSS : ${esc(p.employeur_cnss)}
    </div>
    <div class="titre">
      <div class="t">BULLETIN DE PAIE</div>
      <div class="m">MOIS <span>${esc(moisMaj(b.periode))}</span></div>
    </div>
  </div>
  <div class="periode">DU ${dLong(deb)} AU ${dLong(fin)}</div>

  <table class="ident">
    <tr><th style="width:27%">Nom</th><th style="width:21%">Prénom</th><th>Emploi</th><th style="width:9%">Classif.</th><th style="width:9%">Catégorie</th></tr>
    <tr><td>${esc(nomEmp)}</td><td>${esc(prenomEmp)}</td><td>${esc((e.poste || b.employe_poste || '').toUpperCase())}</td><td class="c">${esc(e.classification || '')}</td><td class="c">${esc(e.categorie || '')}</td></tr>
  </table>
  <table class="ident" style="margin-top:-1px">
    <tr><th>Date naiss.</th><th>Sexe</th><th>Nat.</th><th>Sit. fam</th><th>Nb.enf.</th><th>Nb. parts</th><th>N° CNSS</th><th>Date entrée</th><th>Matricule</th><th>Dép.</th><th>Sec.</th><th>Ser.</th><th>Régime</th><th>Statut</th></tr>
    <tr>
      <td class="c">${dCourt(e.date_naissance)}</td><td class="c">${esc(e.sexe || '')}</td><td class="c">${esc(e.nationalite || '')}</td>
      <td class="c">${esc(SITUATIONS_COURT[e.situation_familiale] || '')}</td><td class="c">${String(num(e.nb_enfants)).padStart(2, '0')}</td>
      <td class="c">${fTaux(b.nb_parts)}</td><td class="c">${esc(e.cnss_numero || '')}</td><td class="c">${dCourt(e.date_embauche)}</td>
      <td class="c">${esc(e.matricule || b.employe_matricule || '')}</td><td class="c">${esc(e.departement || '')}</td><td class="c">${esc(e.section || '')}</td>
      <td class="c">${esc(e.service || '')}</td><td class="c">${esc(e.regime || 'G')}</td><td class="c">${esc(e.statut_salarie || 'E')}</td>
    </tr>
  </table>

  <table class="rub" style="margin-top:-1px">
    <colgroup><col style="width:11mm"/><col/><col style="width:26mm"/><col style="width:20mm"/><col style="width:27mm"/><col style="width:27mm"/></colgroup>
    <thead><tr><th>Code</th><th>Libellé de la rubrique</th><th>Base</th><th>Taux/Nbre</th><th>Gains</th><th>Retenues</th></tr></thead>
    <tbody>${lignesHtml(b.lignes)}<tr class="rempl"><td style="height:${Math.max(6, HAUTEUR_CORPS - (b.lignes || []).length * HAUTEUR_LIGNE)}mm"></td><td></td><td></td><td></td><td></td><td></td></tr></tbody>
  </table>
  <table class="tot"><tr><td style="border:none"></td><td class="b" style="width:27mm">${f(b.total_gains)}</td><td class="b" style="width:27mm">${f(b.total_retenues)}</td></tr></table>

  <div class="net"><div class="lbl">NET A PAYER</div><div class="fl">➜</div><div class="val">***${f(b.net_a_payer)}</div></div>

  <div class="bas">
    <div class="col"><div class="h">RUBRIQUES</div>${cumulLignes.map(([l]) => `<div class="l">${esc(l)}</div>`).join('')}</div>
    <div class="col"><div class="h">CUMULS</div>${cumulLignes.map(([, v]) => `<div class="l r">${v === null || v === undefined ? '&nbsp;' : f(v)}</div>`).join('')}</div>
    <div class="col" style="display:flex;flex-direction:column">
      <div class="h">MODE DE PAIEMENT</div>
      <div style="flex:1;padding:3px 0">${modeLignes.map((l) => `<div class="l">${esc(l)}</div>`).join('')}</div>
      <div class="h">EMARGEMENT</div>
      <div class="emarg"><div>EMPLOYEUR,</div><div>EMPLOYÉ,</div></div>
    </div>
    <div class="col"><div class="h">BILLETAGE</div>
      ${billetage.filter((x) => x.coupure >= 100).map((x) => `<div class="bill"><div class="l r">${f(x.coupure)}</div><div class="l r">${x.nombre}</div></div>`).join('')}
    </div>
  </div>
  ${b.notes ? `<div class="obs"><b>Observations :</b> ${esc(b.notes)}</div>` : ''}
</div>`
}

const page = (titre, corps, autoPrint = true) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" /><title>${esc(titre)}</title><style>${STYLE}</style></head>
<body>${corps}
${autoPrint ? '<script>window.onload = function(){ window.print(); }</script>' : ''}
</body></html>`

export function htmlBulletin(b, employe, societe, params, cumuls, autoPrint = true) {
  return page(`${b.numero} — ${b.employe_nom}`, corpsBulletin(b, employe, societe, params, cumuls), autoPrint)
}

const ouvrir = (html) => {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}

export function imprimerBulletin(b, employe, societe, params, cumuls) {
  return ouvrir(htmlBulletin(b, employe, societe, params, cumuls))
}

// liste : [{ bulletin, employe, cumuls }]
export function imprimerBulletins(liste, societe, params, titre = 'Bulletins de paie') {
  return ouvrir(page(titre, liste.map((x) => corpsBulletin(x.bulletin, x.employe, societe, params, x.cumuls)).join('')))
}
