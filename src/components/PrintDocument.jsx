import LOGO_BASE64 from '../lib/logo.js'
import { fmt, fmtDate } from '../lib/utils'
import { useEffect, useState } from 'react'

export default function PrintDocument({ doc, type = 'facture', onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const lignes = doc.lignes || []
  const sousTotal = doc.sous_total_ht || 0
  const remisePct = doc.remise_pct || 0
  const remise = doc.montant_remise || 0
  const base = doc.base_ht || 0
  const tva = doc.tva || 0
  const css = doc.css || 0
  const ttc = doc.total_ttc || 0
  const isProforma = type === 'proforma'
  const titre = isProforma ? 'FACTURE PRO FORMA' : 'FACTURE'
  const numero = doc.numero || ''
  const commercialTel = doc.commercial_tel || ''
  const commercialEmail = doc.commercial_email || ''

  const [unites, setUnites] = useState(
    lignes.map(l => l.unite || 'Pièce')
  )

  const handlePrint = () => window.print()

  return (
    <>
      <style>{`
        /* ─── ÉCRAN : modal aperçu ─── */
        .preview-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 9999;
          overflow-y: auto;
          padding: 20px;
        }
        .preview-container {
          max-width: 210mm;
          margin: 0 auto;
          background: white;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .preview-actions {
          position: sticky; top: 0;
          background: #1A9E8F; color: white;
          padding: 10px 20px;
          display: flex; justify-content: space-between; align-items: center;
          z-index: 10;
        }
        .preview-actions button {
          background: white; color: #1A9E8F;
          border: none; padding: 8px 18px;
          border-radius: 4px; font-weight: 600;
          cursor: pointer; margin-left: 8px;
        }
        .preview-actions button.close-btn {
          background: transparent; color: white;
          border: 1px solid white;
        }

        /* ─── DOCUMENT (écran + impression) ─── */
        .doc {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          font-size: 10pt;
          color: #222;
          background: white;
          width: 210mm;
          min-height: 297mm;
          padding: 8mm 10mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .doc-header {
          display: flex; align-items: center; gap: 16px;
          border-bottom: 2px solid #1A9E8F;
          padding-bottom: 8px; margin-bottom: 10px;
        }
        .doc-header img { height: 70px; object-fit: contain; }
        .doc-header .company {
          flex: 1; text-align: center;
        }
        .doc-header .company h1 {
          margin: 0; color: #1A9E8F;
          font-size: 18pt; letter-spacing: 1px;
        }
        .doc-header .company p {
          margin: 2px 0; font-size: 9pt; color: #555;
        }
        .doc-title-row {
          display: flex; justify-content: space-between; align-items: center;
          background: #E8F5F3; padding: 8px 12px; margin-bottom: 10px;
        }
        .doc-title-row .titre {
          color: #1A9E8F; font-size: 14pt; font-weight: 700;
        }
        .doc-title-row .numero {
          background: #1A9E8F; color: white;
          padding: 4px 12px; border-radius: 3px;
          font-weight: 600; font-size: 11pt;
        }
        .doc-meta {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 6px 16px; font-size: 9.5pt;
          margin-bottom: 10px;
        }
        .doc-meta .label { color: #666; }
        .doc-meta .value { font-weight: 600; text-align: right; }
        .parties {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin-bottom: 10px;
        }
        .party-box {
          border: 1px solid #1A9E8F;
        }
        .party-box .head {
          background: #1A9E8F; color: white;
          text-align: center; padding: 4px;
          font-size: 9pt; font-weight: 600;
        }
        .party-box .body {
          padding: 6px 8px; font-size: 9pt;
          min-height: 70px;
        }
        .party-box .body p { margin: 2px 0; }
        .mention-pro {
          background: #FFF8E1; border-left: 3px solid #F0B400;
          padding: 5px 10px; margin-bottom: 8px;
          font-size: 8.5pt; font-style: italic;
        }
        table.prestations {
          width: 100%; border-collapse: collapse;
          margin-bottom: 8px; font-size: 9pt;
        }
        table.prestations thead {
          background: #1A9E8F; color: white;
        }
        table.prestations th {
          padding: 5px 6px; text-align: left;
          font-size: 9pt; font-weight: 600;
        }
        table.prestations th.right { text-align: right; }
        table.prestations td {
          padding: 4px 6px;
          border-bottom: 1px solid #ddd;
        }
        table.prestations td.right { text-align: right; }
        table.prestations td.center { text-align: center; }
        .totaux {
          margin-left: auto; width: 55%;
          font-size: 9.5pt;
        }
        .totaux .row {
          display: flex; justify-content: space-between;
          padding: 3px 8px;
        }
        .totaux .row.ttc {
          background: #1A9E8F; color: white;
          font-weight: 700; font-size: 11pt;
          padding: 6px 10px; margin-top: 4px;
        }
        .estimation {
          border-left: 3px solid #1A9E8F;
          padding: 4px 10px; margin: 8px 0;
          background: #F4FBFA; font-size: 9pt;
        }
        .conditions {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-top: 8px; font-size: 8.5pt;
        }
        .conditions h4 {
          margin: 0 0 4px; color: #1A9E8F;
          font-size: 9pt; border-bottom: 1px solid #1A9E8F;
          padding-bottom: 2px;
        }
        .conditions p { margin: 2px 0; }
        .signatures {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-top: 10px;
          font-size: 9pt;
        }
        .signatures .sign-box {
          border-top: 1px solid #999;
          padding-top: 4px; min-height: 40px;
        }
        .doc-footer {
          margin-top: auto;
          border-top: 2px solid #1A9E8F;
          padding-top: 6px;
          text-align: center;
          font-size: 7.5pt; color: #555;
          line-height: 1.4;
        }
        .doc-footer p { margin: 1px 0; }

        /* ─── IMPRESSION ─── */
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }
          #print-root {
            position: absolute;
            left: 0; top: 0;
            width: 210mm;
            margin: 0;
            padding: 0;
          }
          .doc {
            width: 210mm;
            min-height: 297mm;
            padding: 8mm 10mm;
            box-shadow: none !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .preview-overlay, .preview-actions, .no-print {
            display: none !important;
          }
          .unite-select {
            border: none !important;
            background: transparent !important;
            appearance: none !important;
            -webkit-appearance: none !important;
            padding: 0 !important;
          }
        }

        .unite-select {
          border: 1px solid #ccc;
          padding: 2px 4px;
          font-size: 9pt;
          background: white;
          border-radius: 3px;
        }
      `}</style>

      <div className="preview-overlay no-print">
        <div className="preview-actions">
          <span style={{ fontWeight: 600 }}>Aperçu — {titre} {numero}</span>
          <div>
            <button onClick={handlePrint}>🖨 Imprimer</button>
            <button className="close-btn" onClick={onClose}>Fermer</button>
          </div>
        </div>
        <div className="preview-container">
          <div id="print-root">
            <DocumentContent
              doc={doc} lignes={lignes} sousTotal={sousTotal} remisePct={remisePct}
              remise={remise} base={base} tva={tva} css={css} ttc={ttc}
              isProforma={isProforma} titre={titre} numero={numero}
              commercialTel={commercialTel} commercialEmail={commercialEmail}
              unites={unites} setUnites={setUnites}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function DocumentContent({
  doc, lignes, sousTotal, remisePct, remise, base, tva, css, ttc,
  isProforma, titre, numero, commercialTel, commercialEmail,
  unites, setUnites
}) {
  const updateUnite = (i, v) => {
    const next = [...unites]; next[i] = v; setUnites(next)
  }

  return (
    <div className="doc">
      {/* EN-TÊTE */}
      <div className="doc-header">
        <img src={LOGO_BASE64} alt="Galerie Médicale" />
        <div className="company">
          <h1>GALERIE MÉDICALE</h1>
          <p>Tél : (00241) 60202900 • acceuil@sajgroupe.com • www.sajgroupe.com</p>
        </div>
        <div style={{ width: 70 }}></div>
      </div>

      {/* TITRE + N° */}
      <div className="doc-title-row">
        <span className="titre">{titre}</span>
        <span className="numero">N° {numero}</span>
      </div>

      {/* META */}
      <div className="doc-meta">
        <div className="label">Date d'émission :</div>
        <div className="value">{fmtDate(doc.date_emission)}</div>
        {isProforma && <><div className="label">N° de Pro Forma :</div><div className="value">{numero}</div></>}
        <div className="label">Date d'échéance :</div>
        <div className="value">{fmtDate(doc.date_echeance)}</div>
        <div className="label">Objet :</div>
        <div className="value">{doc.objet || '—'}</div>
      </div>

      {/* PARTIES */}
      <div className="parties">
        <div className="party-box">
          <div className="head">ÉMETTEUR</div>
          <div className="body">
            <p><b>Galerie Médicale – SAJ Groupe</b></p>
            <p>Gallerie Océane, Libreville, Gabon</p>
            <p>Tél : {commercialTel || '—'}</p>
            <p>Email : {commercialEmail || '—'}</p>
            <p>NIF : 49761L • RCCM : GA-LBV-01-2020-B12-00179</p>
          </div>
        </div>
        <div className="party-box">
          <div className="head">CLIENT / DESTINATAIRE</div>
          <div className="body">
            <p><b>Nom / Raison sociale :</b> {doc.client_nom || '—'}</p>
            <p><b>Adresse :</b> {doc.client_adresse || '—'}</p>
            <p><b>Ville / Pays :</b> {doc.client_ville || '—'}</p>
            <p><b>Tél :</b> {doc.client_tel || '—'}</p>
            <p><b>NIF :</b> {doc.client_nif || '—'}</p>
          </div>
        </div>
      </div>

      {isProforma && (
        <div className="mention-pro">
          ⚠ Document non fiscal — Valable 30 jours — Ne vaut pas engagement de paiement
        </div>
      )}

      {/* PRESTATIONS */}
      <table className="prestations">
        <thead>
          <tr>
            <th style={{ width: '4%' }}>N°</th>
            <th style={{ width: '40%' }}>DÉSIGNATION / PRESTATION</th>
            <th className="right" style={{ width: '8%' }}>QTÉ</th>
            <th style={{ width: '12%' }}>UNITÉ</th>
            <th className="right" style={{ width: '18%' }}>P.U. (FCFA)</th>
            <th className="right" style={{ width: '18%' }}>TOTAL HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              <td className="center">{i + 1}</td>
              <td>{l.designation}</td>
              <td className="right">{l.quantite}</td>
              <td>
                <select
                  className="unite-select"
                  value={unites[i] || 'Pièce'}
                  onChange={(e) => updateUnite(i, e.target.value)}
                >
                  <option>Pièce</option>
                  <option>Boîte</option>
                  <option>Carton</option>
                  <option>Forfait</option>
                  <option>Séance</option>
                  <option>Flacon</option>
                </select>
              </td>
              <td className="right">{fmt(l.prix_unitaire)} FCFA</td>
              <td className="right">{fmt(l.total_ht)} FCFA</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTAUX */}
      <div className="totaux">
        <div className="row"><span>Sous-total HT</span><b>{fmt(sousTotal)} FCFA</b></div>
        <div className="row"><span>Remise ({remisePct}%)</span><b>{fmt(remise)} FCFA</b></div>
        <div className="row"><span>Base HT après remise</span><b>{fmt(base)} FCFA</b></div>
        <div className="row"><span>TVA (18%)</span><b>{fmt(tva)} FCFA</b></div>
        <div className="row"><span>CSS (1%)</span><b>{fmt(css)} FCFA</b></div>
        <div className="row ttc"><span>TOTAL TTC</span><span>{fmt(ttc)} FCFA</span></div>
      </div>

      {isProforma && (
        <div className="estimation">
          Estimation arrêtée à la somme de <b>{fmt(ttc)} FCFA TTC</b> (sous réserve de validation)
        </div>
      )}

      {/* CONDITIONS */}
      <div className="conditions">
        <div>
          <h4>MODALITÉS DE PAIEMENT</h4>
          <p>Virement bancaire :</p>
          <p>Banque : ORABANK</p>
          <p>N° Compte : 40021 01000 21953600201 25</p>
          <p>Libellé : Fact. N° {numero}</p>
          <p>Mobile Money : Airtel / Moov • Espèces acceptées</p>
        </div>
        <div>
          <h4>CONDITIONS GÉNÉRALES</h4>
          <p>• Délai de paiement : 30 jours</p>
          <p>• Pénalités : 1,5 % / mois de retard</p>
          <p>• TVA 18 % et CSS 1 % — CGI du Gabon</p>
          <p>• Toute facture non contestée dans 8 jours est réputée acceptée</p>
        </div>
      </div>

      {/* SIGNATURES */}
      <div className="signatures">
        <div className="sign-box">
          <b>Signature et cachet du client :</b>
          <p style={{ fontStyle: 'italic', fontSize: '8pt' }}>(Bon pour accord)</p>
        </div>
        <div className="sign-box">
          <b>Signature et cachet Galerie Médicale :</b>
          <p style={{ fontSize: '8pt' }}>Fait à Libreville, le ___________</p>
        </div>
      </div>

      {/* PIED DE PAGE */}
      <div className="doc-footer">
        <p>Société à Responsabilité Limitée au Capital de 10 000 000 FCFA • NIF : 49761L • RCCM : GA-LBV-01-2020-B12-00179</p>
        <p>📞 (00241) 60202900 • ✉ acceuil@sajgroupe.com • 🌐 www.sajgroupe.com</p>
      </div>
    </div>
  )
}
