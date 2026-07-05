import LOGO_BASE64 from '../lib/logo.js'

const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const STATUTS = {
  brouillon: 'Brouillon', envoye: 'Envoyé au fournisseur', recu: 'Reçu', annule: 'Annulé',
}

export function imprimerBonCommande(bon, lignes) {
  const lignesHtml = (lignes || []).map((l, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${escapeHtml(l.reference || '')}</td>
      <td>${escapeHtml(l.designation || '')}</td>
      <td style="text-align:center">${fmt(l.quantite)}</td>
      <td style="text-align:right">${fmt(l.prix_unitaire)}</td>
      <td style="text-align:right">${fmt(Number(l.quantite) * Number(l.prix_unitaire || 0))}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<title>${escapeHtml(bon.numero)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; font-size: 12px; }
  .doc { max-width: 190mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1A9E8F; padding-bottom: 12px; }
  .head img { height: 70px; }
  .head .co { text-align: right; font-size: 11px; color: #475569; }
  .co .name { font-size: 15px; font-weight: 700; color: #1A9E8F; }
  .title { text-align: center; margin: 18px 0 6px; }
  .title h1 { color: #1A9E8F; margin: 0; font-size: 22px; letter-spacing: 1px; }
  .title .num { font-size: 13px; color: #475569; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin: 14px 0; }
  .box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
  .box h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #1A9E8F; letter-spacing: .5px; }
  .box p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  thead th { background: #1A9E8F; color: #fff; padding: 7px 8px; font-size: 11px; text-align: left; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #eef2f5; }
  .totaux { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totaux table { width: 250px; }
  .totaux td { padding: 5px 8px; }
  .totaux .grand { font-weight: 700; background: #f0fdfa; color: #0f766e; font-size: 13px; }
  .notes { margin-top: 16px; font-size: 11px; color: #475569; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; }
  .sign div { width: 45%; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 11px; text-align: center; color: #475569; }
  .foot { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .badge { display: inline-block; background: #1A9E8F; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 11px; }
</style></head>
<body><div class="doc">
  <div class="head">
    <img src="${LOGO_BASE64}" alt="logo" />
    <div class="co">
      <div class="name">GALERIE MÉDICALE — SAJ GROUPE</div>
      <div>Libreville, Gabon</div>
      <div>RCCM : GA-LBV-01-2020-B12-00179</div>
      <div>www.sajgroupe.com</div>
    </div>
  </div>

  <div class="title">
    <h1>BON DE COMMANDE</h1>
    <div class="num">N° ${escapeHtml(bon.numero)} &nbsp;·&nbsp; <span class="badge">${STATUTS[bon.statut] || bon.statut}</span></div>
  </div>

  <div class="meta">
    <div class="box">
      <h3>Fournisseur</h3>
      <p style="font-weight:700">${escapeHtml(bon.fournisseur_nom || '')}</p>
      <p>${escapeHtml(bon.fournisseur_adresse || '')}</p>
    </div>
    <div class="box">
      <h3>Détails</h3>
      <p><strong>Date d'émission :</strong> ${fmtDate(bon.date_emission)}</p>
      <p><strong>Livraison prévue :</strong> ${fmtDate(bon.date_livraison_prevue)}</p>
      <p><strong>Objet :</strong> ${escapeHtml(bon.objet || '—')}</p>
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="width:30px;text-align:center">#</th>
      <th style="width:90px">Réf.</th>
      <th>Désignation</th>
      <th style="width:60px;text-align:center">Qté</th>
      <th style="width:90px;text-align:right">P.U. HT</th>
      <th style="width:100px;text-align:right">Total HT</th>
    </tr></thead>
    <tbody>${lignesHtml}</tbody>
  </table>

  <div class="totaux">
    <table>
      <tr><td>Sous-total HT</td><td style="text-align:right">${fmt(bon.sous_total_ht)} FCFA</td></tr>
      <tr><td>TVA 18 %</td><td style="text-align:right">${fmt(bon.tva)} FCFA</td></tr>
      <tr class="grand"><td>TOTAL TTC</td><td style="text-align:right">${fmt(bon.total_ttc)} FCFA</td></tr>
    </table>
  </div>

  ${bon.notes ? `<div class="notes"><strong>Notes :</strong> ${escapeHtml(bon.notes)}</div>` : ''}

  <div class="sign">
    <div>Le responsable des achats</div>
    <div>Le fournisseur (bon pour accord)</div>
  </div>

  <div class="foot">Galerie Médicale — SAJ Groupe · Libreville, Gabon · Document généré le ${new Date().toLocaleDateString('fr-FR')}</div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
