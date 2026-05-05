import LOGO_BASE64 from '../lib/logo.js'
import { fmt, fmtDate } from '../lib/utils'
import { useEffect } from 'react'

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
  const numero = doc.numero || '—'

  const S = {
    page: { padding: '28px 36px', fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#2C2C2C', background: '#fff', maxWidth: 780, margin: '0 auto' },
    tealBar: { height: 5, background: '#1A9E8F', borderRadius: 2, margin: '10px 0' },
    thinBar: { height: 1, background: '#1A9E8F', margin: '6px 0' },
    label: { fontWeight: 700, fontSize: 11 },
    val: { fontSize: 11 },
    th: { background: '#1A9E8F', color: '#fff', padding: '7px 10px', fontSize: 11, fontWeight: 700, borderBottom: '2px solid #0f6e56' },
    td: { padding: '6px 10px', fontSize: 11, borderBottom: '1px solid #e5e7eb' },
    tdAlt: { padding: '6px 10px', fontSize: 11, borderBottom: '1px solid #e5e7eb', background: '#E8F6F5' },
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-doc, #print-doc * { visibility: visible !important; }
          #print-doc { position: fixed !important; inset: 0 !important; background: white !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Barre actions */}
        <div className="no-print" style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Aperçu — {numero}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
            <button onClick={() => window.print()} style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: '#1A9E8F', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              🖨️ Imprimer / PDF
            </button>
          </div>
        </div>

        {/* ═══ DOCUMENT IMPRIMABLE ═══ */}
        <div id="print-doc" style={S.page}>

          {/* ── EN-TÊTE ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            {/* Logo */}
            <div style={{ width: 140 }}>
              <img src={LOGO_BASE64} alt="Galerie Médicale" style={{ width: 130, objectFit: 'contain' }} />
            </div>
            {/* Titre société centré */}
            <div style={{ flex: 1, textAlign: 'center', paddingTop: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1A9E8F', letterSpacing: 1 }}>GALERIE MÉDICALE</div>
              <div style={{ fontSize: 10, color: '#6D6D6D', marginTop: 2 }}>
                Tél. : (00241) 60202900 | Acceuil@sajgroupe.com | www.sajgroupe.com
              </div>
            </div>
            <div style={{ width: 140 }} />
          </div>

          <div style={S.tealBar} />

          {/* ── TITRE FACTURE + N° ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 8px' }}>
            <div style={{ background: '#e5e7eb', padding: '6px 24px', borderRadius: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#1A9E8F', letterSpacing: 2 }}>{titre}</span>
            </div>
            <div style={{ background: '#e5e7eb', padding: '6px 20px', borderRadius: 4, textAlign: 'right' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2C', letterSpacing: 1 }}>N° {numero}</span>
            </div>
          </div>

          {/* ── BLOC DATE/OBJET ── */}
          <table style={{ width: '55%', marginLeft: 'auto', borderCollapse: 'collapse', marginBottom: 12, fontSize: 11 }}>
            {[
              ["Date d'émission :", fmtDate(doc.date_emission)],
              ["N° de " + (isProforma ? 'Pro Forma' : 'Facture') + " :", numero],
              ["Date d'échéance :", fmtDate(doc.date_echeance)],
              ["Objet :", doc.objet || ''],
            ].map(([label, val]) => (
              <tr key={label}>
                <td style={{ padding: '3px 10px', fontWeight: 700, borderBottom: '1px solid #e5e7eb', width: '45%' }}>{label}</td>
                <td style={{ padding: '3px 10px', borderBottom: '1px solid #e5e7eb' }}>{val}</td>
              </tr>
            ))}
          </table>

          {/* ── ÉMETTEUR / CLIENT ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            {/* Émetteur */}
            <div>
              <div style={{ background: '#1A9E8F', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 10px', textAlign: 'center', borderRadius: '4px 4px 0 0' }}>ÉMETTEUR</div>
              <div style={{ border: '1px solid #1A9E8F', borderTop: 'none', padding: '8px 10px', fontSize: 11, lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700 }}>Galerie Médicale – SAJ Groupe</div>
                <div>Gallerie Océane, Libreville, Gabon</div>
                <div>Tél. : (00241) 60202900</div>
                <div>Email : acceuil@sajgroupe.com</div>
                <div>NIF : 49761L | RCCM : GA-MBV-01-2020-B12-00179</div>
              </div>
            </div>
            {/* Client */}
            <div>
              <div style={{ background: '#1A9E8F', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 10px', textAlign: 'center', borderRadius: '4px 4px 0 0' }}>CLIENT / DESTINATAIRE</div>
              <div style={{ border: '1px solid #1A9E8F', borderTop: 'none', padding: '8px 10px', fontSize: 11, lineHeight: 1.8 }}>
                {[
                  ['Nom / Raison sociale :', doc.client_nom || ''],
                  ['Adresse :', doc.client_adresse || ''],
                  ['Ville / Pays :', 'Gabon'],
                  ['NIF :', doc.client_nif || ''],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>{label}</span>
                    <span>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── BANDEAU INFO ── */}
          {isProforma && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontStyle: 'italic', color: '#856404', marginBottom: 6 }}>
              ⚠ Document non fiscal – Valable 30 jours – Ne vaut pas engagement de paiement
            </div>
          )}

          {/* ── TABLEAU PRESTATIONS ── */}
          <div style={{ marginBottom: 2, background: '#1A9E8F', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 10px', textAlign: 'center' }}>
            DÉTAIL DES PRESTATIONS
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead>
              <tr style={{ background: '#B2DED9' }}>
                <th style={{ ...S.th, width: 30, textAlign: 'center', background: '#B2DED9', color: '#2C2C2C' }}>N°</th>
                <th style={{ ...S.th, background: '#B2DED9', color: '#2C2C2C' }}>Désignation / Prestation</th>
                <th style={{ ...S.th, width: 50, textAlign: 'center', background: '#B2DED9', color: '#2C2C2C' }}>Qté</th>
                <th style={{ ...S.th, width: 70, textAlign: 'center', background: '#B2DED9', color: '#2C2C2C' }}>Unité</th>
                <th style={{ ...S.th, width: 110, textAlign: 'right', background: '#B2DED9', color: '#2C2C2C' }}>P.U. (FCFA)</th>
                <th style={{ ...S.th, width: 120, textAlign: 'right', background: '#B2DED9', color: '#2C2C2C' }}>Total HT</th>
              </tr>
            </thead>
            <tbody>
              {/* Lignes remplies */}
              {lignes.map((l, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#E8F6F5' : '#fff' }}>
                  <td style={S.td} align="center">{i + 1}</td>
                  <td style={S.td}>{l.designation}</td>
                  <td style={S.td} align="center">{l.quantite}</td>
                  <td style={S.td} align="center">Forfait</td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.prix_unitaire)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.total_ht)}</td>
                </tr>
              ))}
              {/* Lignes vides pour compléter jusqu'à 10 */}
              {Array.from({ length: Math.max(0, 10 - lignes.length) }).map((_, i) => (
                <tr key={'empty-' + i} style={{ background: (lignes.length + i) % 2 === 0 ? '#E8F6F5' : '#fff' }}>
                  <td style={S.td} align="center">{lignes.length + i + 1}</td>
                  <td style={S.td}></td>
                  <td style={S.td}></td>
                  <td style={{ ...S.td, color: '#aaa', fontStyle: 'italic' }} align="center">Forfait</td>
                  <td style={S.td}></td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#aaa' }}>-</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── TOTAUX ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <table style={{ width: 320, borderCollapse: 'collapse', fontSize: 11 }}>
              {[
                ['Sous-total HT :', fmt(sousTotal), false],
                [`Remise (%) :`, (remisePct || 0).toFixed(1) + '%', false],
                ['Montant remise :', fmt(remise), false],
                ['Base HT après remise :', fmt(base), false],
                ['TVA (18%) :', fmt(tva), false],
                ['CSS (1%) :', fmt(css), false],
              ].map(([label, val, bold]) => (
                <tr key={label}>
                  <td style={{ padding: '3px 10px', fontWeight: bold ? 700 : 400, borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#444' }}>{label}</td>
                  <td style={{ padding: '3px 10px', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontWeight: bold ? 700 : 400 }}>{val}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ padding: 0 }}>
                  <div style={{ background: '#1A9E8F', color: '#fff', display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontWeight: 700, fontSize: 13 }}>
                    <span>TOTAL TTC :</span>
                    <span style={{ fontFamily: 'monospace' }}>{fmt(ttc)}</span>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          {/* ── ARRÊTÉ ── */}
          <div style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 10, padding: '6px 10px', background: '#f9f9f9', borderLeft: '3px solid #1A9E8F' }}>
            {isProforma
              ? <>Estimation arrêtée à la somme de : <strong>{fmt(ttc)}</strong> FCFA TTC (sous réserve de validation)</>
              : <>Arrêtée la présente facture à la somme de : <strong>[Montant en lettres]</strong> FCFA TTC</>
            }
          </div>

          {/* ── MODALITÉS / CONDITIONS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: '#1A9E8F', fontWeight: 700, fontSize: 11, borderBottom: '1px solid #1A9E8F', paddingBottom: 3, marginBottom: 6 }}>MODALITÉS DE PAIEMENT</div>
              <div style={{ fontSize: 10, lineHeight: 1.9, color: '#333' }}>
                <div>Virement bancaire :</div>
                <div style={{ paddingLeft: 8 }}>Banque : ORABANK</div>
                <div style={{ paddingLeft: 8 }}>N° Compte : 40021 01000 21953600201 25</div>
                <div style={{ paddingLeft: 8 }}>Libellé : Fact. N° {numero}</div>
                <div>Mobile Money : Airtel / Moov</div>
                <div>Espèces acceptées</div>
              </div>
            </div>
            <div>
              <div style={{ color: '#1A9E8F', fontWeight: 700, fontSize: 11, borderBottom: '1px solid #1A9E8F', paddingBottom: 3, marginBottom: 6 }}>CONDITIONS GÉNÉRALES</div>
              <div style={{ fontSize: 10, lineHeight: 1.9, color: '#333' }}>
                <div>• Délai de paiement : 30 jours</div>
                <div>• Pénalités : 1,5% / mois de retard</div>
                <div>• TVA 18% et CSS 1% — CGI du Gabon</div>
                <div>• Toute facture non contestée dans 8 jours</div>
                <div style={{ paddingLeft: 8 }}>est réputée acceptée.</div>
              </div>
            </div>
          </div>

          {/* ── SIGNATURES ── */}
          <div style={S.thinBar} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 36 }}>Signature et cachet du client :</div>
              <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 3, fontSize: 10, color: '#888', fontStyle: 'italic' }}>(Bon pour accord)</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 36 }}>Signature et cachet Galerie Médicale :</div>
              <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 3, fontSize: 10, color: '#888', fontStyle: 'italic' }}>Fait à Libreville, le : _______________</div>
            </div>
          </div>

          {/* ── PIED DE PAGE ── */}
          <div style={{ ...S.tealBar, margin: '12px 0 6px' }} />
          <div style={{ fontSize: 9, color: '#6D6D6D', textAlign: 'center' }}>
            Société à Responsabilité Limitée au Capital de 10 000 000 FCFA &nbsp;|&nbsp;
            NIF : 49761L &nbsp;|&nbsp; RCCM : GA-MBV-01-2020-B12-00179 &nbsp;|&nbsp;
            ✆ (00241) 60202900 &nbsp;|&nbsp; ✉ acceuil@sajgroupe.com &nbsp;|&nbsp; 🌐 www.sajgroupe.com
          </div>

        </div>{/* /print-doc */}
      </div>
    </div>
  )
}
