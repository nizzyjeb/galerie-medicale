import LOGO_BASE64 from '../lib/logo.js'
import { fmt, fmtDate } from '../lib/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const [commercialTel, setCommercialTel] = useState('')
  const [commercialEmail, setCommercialEmail] = useState('')
  const [unites, setUnites] = useState({})
  const isProforma = type === 'proforma'
  const titre = isProforma ? 'FACTURE PRO FORMA' : 'FACTURE'
  const numero = doc.numero || '—'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
      display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'16px' }}>

      <style>{`
        @media print {
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            position: static !important;
          }
          body > *:not(#print-root) { display: none !important; }
          #print-root {
            display: block !important;
            position: static !important;
            background: white !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          #print-root * { visibility: visible !important; }
          /* Tient sur 1 page A4 : evite les sauts de page entre sections importantes */
          #print-root, #print-root * { page-break-inside: avoid !important; }
          #print-root table { page-break-inside: auto !important; }
          .no-print { display: none !important; }
          .print-only { display: inline !important; }
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 6mm 8mm;
          }
        }
        @media screen {
          #print-root { display: none !important; }
        }
      `}</style>

      {/* Zone d'impression : montée en portail directement sous body pour échapper au modal */}
      {typeof document !== 'undefined' && createPortal(
        <div id="print-root">
          <DocumentContent
            doc={doc} lignes={lignes} sousTotal={sousTotal} remisePct={remisePct}
            remise={remise} base={base} tva={tva} css={css} ttc={ttc}
            isProforma={isProforma} titre={titre} numero={numero}
            commercialTel={commercialTel} commercialEmail={commercialEmail}
            unites={unites} setUnites={setUnites}
          />
        </div>,
        document.body
      )}

      {/* Aperçu écran */}
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:820,
        boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Barre actions */}
        <div className="no-print" style={{ padding:'12px 20px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, background:'#fff', borderRadius:'12px 12px 0 0', zIndex:1 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>Aperçu — {numero}</div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input
                placeholder="Tél. du commercial"
                value={commercialTel}
                onChange={e => setCommercialTel(e.target.value)}
                style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #e5e7eb',
                  fontSize:12, width:170, fontFamily:'Arial,sans-serif' }}
              />
              <input
                placeholder="Email du commercial"
                value={commercialEmail}
                onChange={e => setCommercialEmail(e.target.value)}
                style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #e5e7eb',
                  fontSize:12, width:200, fontFamily:'Arial,sans-serif' }}
              />
            </div>
            <button onClick={onClose} style={{ padding:'6px 14px', borderRadius:7,
              border:'1px solid #e5e7eb', background:'transparent', cursor:'pointer', fontSize:13 }}>
              Fermer
            </button>
            <button onClick={() => window.print()} style={{ padding:'6px 18px', borderRadius:7,
              border:'none', background:'#1A9E8F', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:500 }}>
              🖨️ Imprimer / PDF
            </button>
          </div>
        </div>

        {/* Aperçu du document */}
        <div style={{ padding:'28px 36px' }}>
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
  )
}

function DocumentContent({ doc, lignes, sousTotal, remisePct, remise, base, tva, css, ttc, isProforma, titre, numero, commercialTel, commercialEmail, unites, setUnites }) {
  const TEAL = '#1A9E8F'
  const TEAL_L = '#E8F6F5'
  const TEAL_M = '#B2DED9'
  const DARK = '#2C2C2C'
  const GRAY = '#6D6D6D'

  // Afficher uniquement les lignes reellement facturees (plus de remplissage vide)
  const lignesAffichees = lignes

  return (
    <div style={{ fontFamily:'Arial, sans-serif', fontSize:11, color:DARK, background:'#fff' }}>

      {/* ── EN-TÊTE : Logo gauche + Société centre ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:3 }}>
        <img src={LOGO_BASE64} alt="Galerie Médicale" style={{ height:75, objectFit:'contain' }} />
        <div style={{ flex:1, textAlign:'center', padding:'4px 16px 0' }}>
          <div style={{ fontSize:16, fontWeight:700, color:TEAL, letterSpacing:1 }}>GALERIE MÉDICALE</div>
          <div style={{ fontSize:9, color:GRAY, marginTop:2 }}>
            Tél. : (00241) 60202900 | Acceuil@sajgroupe.com | www.sajgroupe.com
          </div>
        </div>
        <div style={{ width:75 }} />
      </div>

      {/* Barre teal */}
      <div style={{ height:3, background:TEAL, borderRadius:2, margin:'4px 0' }} />

      {/* ── TITRE + N° ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'4px 0 4px' }}>
        <div style={{ background:'#e5e7eb', padding:'3px 16px', borderRadius:4 }}>
          <span style={{ fontSize:17, fontWeight:900, color:TEAL, letterSpacing:2 }}>{titre}</span>
        </div>
        <div style={{ background:'#e5e7eb', padding:'3px 14px', borderRadius:4 }}>
          <span style={{ fontSize:13, fontWeight:700, color:DARK }}>N° {numero}</span>
        </div>
      </div>

      {/* ── BLOC DATES/OBJET ── */}
      <table style={{ width:'55%', marginLeft:'auto', borderCollapse:'collapse', marginBottom:5, fontSize:10 }}>
        <tbody>
          {[
            ["Date d'émission :", fmtDate(doc.date_emission)],
            ["N° de " + (isProforma ? "Pro Forma" : "Facture") + " :", numero],
            ["Date d'échéance :", fmtDate(doc.date_echeance)],
            ["Objet :", doc.objet || ''],
          ].map(([label, val]) => (
            <tr key={label}>
              <td style={{ padding:'1px 8px', fontWeight:700, borderBottom:'1px solid #e5e7eb', width:'45%' }}>{label}</td>
              <td style={{ padding:'1px 8px', borderBottom:'1px solid #e5e7eb' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── ÉMETTEUR / CLIENT ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:5 }}>
        {/* Émetteur */}
        <div>
          <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:10,
            padding:'3px 8px', textAlign:'center', borderRadius:'4px 4px 0 0' }}>ÉMETTEUR</div>
          <div style={{ border:`1px solid ${TEAL}`, borderTop:'none', padding:'5px 8px', fontSize:10, lineHeight:1.5 }}>
            <div style={{ fontWeight:700 }}>Galerie Médicale – SAJ Groupe</div>
            <div>Gallerie Océane, Libreville, Gabon</div>
            <div>Tél. : <span style={{ borderBottom: commercialTel ? 'none' : '1px solid #aaa', paddingBottom:1 }}>{commercialTel || '_______________________'}</span></div>
            <div>Email : <span style={{ borderBottom: commercialEmail ? 'none' : '1px solid #aaa', paddingBottom:1 }}>{commercialEmail || '_______________________'}</span></div>
            <div>NIF : 49761L | RCCM : GA-LBV-01-2020-B12-00179</div>
            <div style={{ marginTop:4, fontStyle:'italic', color:'#1A9E8F', fontWeight:600 }}>Représentant</div>
          </div>
        </div>
        {/* Client */}
        <div>
          <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:10,
            padding:'3px 8px', textAlign:'center', borderRadius:'4px 4px 0 0' }}>CLIENT / DESTINATAIRE</div>
          <div style={{ border:`1px solid ${TEAL}`, borderTop:'none', padding:'5px 8px', fontSize:10, lineHeight:1.5 }}>
            {[
              ['Nom / Raison sociale :', doc.client_nom || ''],
              ['Adresse :', doc.client_adresse || ''],
              ['Ville / Pays :', 'Gabon'],
              ['Tél. :', ''],
              ['NIF :', doc.client_nif || ''],
            ].map(([label, val]) => (
              <div key={label} style={{ display:'flex', gap:6 }}>
                <span style={{ fontWeight:700, flexShrink:0 }}>{label}</span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bandeau pro forma */}
      {isProforma && (
        <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:4,
          padding:'3px 10px', fontSize:10, fontStyle:'italic', color:'#856404', marginBottom:6 }}>
          ⚠ Document non fiscal – Valable 30 jours – Ne vaut pas engagement de paiement
        </div>
      )}

      {/* ── TITRE TABLEAU ── */}
      <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:10,
        padding:'3px 8px', textAlign:'center', marginBottom:0 }}>
        DÉTAIL DES PRESTATIONS
      </div>

      {/* ── TABLEAU PRESTATIONS ── */}
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:5 }}>
        <thead>
          <tr style={{ background:TEAL_M }}>
            {[['N°','30px','center'],['Désignation / Prestation','','left'],
              ['Qté','50px','center'],['Unité','70px','center'],
              ['P.U. (FCFA)','110px','right'],['Total HT','115px','right']].map(([h,w,a]) => (
              <th key={h} style={{ padding:'3px 6px', fontSize:9, fontWeight:700, color:DARK,
                borderBottom:`2px solid ${TEAL}`, width:w||'auto', textAlign:a }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignesAffichees.map((l, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? TEAL_L : '#fff' }}>
              <td style={{ padding:'3px 6px', fontSize:9, textAlign:'center', borderBottom:'1px solid #e5e7eb', color:GRAY }}>{i+1}</td>
              <td style={{ padding:'3px 6px', fontSize:9, borderBottom:'1px solid #e5e7eb' }}>{l?.designation || ''}</td>
              <td style={{ padding:'3px 6px', fontSize:9, textAlign:'center', borderBottom:'1px solid #e5e7eb' }}>{l?.quantite || ''}</td>
              <td style={{ padding:'3px 6px', fontSize:9, textAlign:'center', borderBottom:'1px solid #e5e7eb' }}>
                {l ? (
                  <>
                    <select
                      className="no-print"
                      value={unites[i] || 'Pièce'}
                      onChange={e => setUnites && setUnites(prev => ({ ...prev, [i]: e.target.value }))}
                      style={{ fontSize:10, border:'1px solid #ccc', borderRadius:4, padding:'1px 4px',
                        background:'#fff', cursor:'pointer', fontFamily:'Arial,sans-serif', width:70 }}
                    >
                      <option>Pièce</option>
                      <option>Boîte</option>
                      <option>Carton</option>
                      <option>Forfait</option>
                      <option>Séance</option>
                      <option>Flacon</option>
                    </select>
                    <span className="print-only" style={{ fontStyle:'italic', color:GRAY }}>{unites[i] || 'Pièce'}</span>
                  </>
                ) : (
                  <span style={{ fontStyle:'italic', color:GRAY }}>—</span>
                )}
              </td>
              <td style={{ padding:'3px 6px', fontSize:9, textAlign:'right', fontFamily:'monospace', borderBottom:'1px solid #e5e7eb' }}>
                {l ? fmt(l.prix_unitaire) : ''}
              </td>
              <td style={{ padding:'3px 6px', fontSize:9, textAlign:'right', fontFamily:'monospace', fontWeight:600, borderBottom:'1px solid #e5e7eb' }}>
                {l ? fmt(l.total_ht) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── TOTAUX ── */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
        <table style={{ width:280, borderCollapse:'collapse', fontSize:10 }}>
          <tbody>
            {[
              ['Sous-total HT :', fmt(sousTotal), true],
              ['Remise (%) :', (remisePct||0).toFixed(1) + '%', true],
              ['Montant remise :', fmt(remise), true],
              ['Base HT après remise :', fmt(base), true],
              ['TVA (18%) :', fmt(tva), tva > 0],
              ['CSS (1%) :', fmt(css), true],
            ].filter(([,,show]) => show).map(([label, val]) => (
              <tr key={label}>
                <td style={{ padding:'2px 6px', borderBottom:'1px solid #e5e7eb', textAlign:'right', color:GRAY }}>{label}</td>
                <td style={{ padding:'2px 6px', fontFamily:'monospace', borderBottom:'1px solid #e5e7eb', textAlign:'right' }}>{val}</td>
              </tr>
            ))}
            {tva === 0 && css > 0 && (
              <tr>
                <td colSpan={2} style={{ padding:'2px 6px', textAlign:'right', fontStyle:'italic', color:'#92400e', fontSize:9 }}>
                  TVA non applicable (items exonérés)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:5 }}>
        <div style={{ width:280, background:TEAL, color:'#fff', display:'flex',
          justifyContent:'space-between', padding:'5px 8px', fontWeight:700, fontSize:12, borderRadius:4 }}>
          <span>TOTAL TTC :</span>
          <span style={{ fontFamily:'monospace' }}>{fmt(ttc)}</span>
        </div>
      </div>

      {/* ── ARRÊTÉ ── */}
      <div style={{ fontSize:10, fontStyle:'italic', marginBottom:5, padding:'3px 8px',
        background:'#f9f9f9', borderLeft:`3px solid ${TEAL}` }}>
        {isProforma
          ? <>Estimation arrêtée à la somme de : <strong>{fmt(ttc)}</strong> FCFA TTC (sous réserve de validation)</>
          : <>Arrêtée la présente facture à la somme de : <strong>[Montant en lettres]</strong> FCFA TTC</>
        }
      </div>

      {/* ── MODALITÉS / CONDITIONS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:5 }}>
        <div>
          <div style={{ color:TEAL, fontWeight:700, fontSize:10, borderBottom:`1px solid ${TEAL}`, paddingBottom:2, marginBottom:3 }}>
            MODALITÉS DE PAIEMENT
          </div>
          <div style={{ fontSize:9, lineHeight:1.4, color:DARK }}>
            <div>Virement bancaire :</div>
            <div style={{ paddingLeft:6 }}>Banque : ORABANK</div>
            <div style={{ paddingLeft:6 }}>N° Compte : 40021 01000 21953600201 25</div>
            <div style={{ paddingLeft:6 }}>Libellé : Fact. N° {numero}</div>
            <div>Mobile Money : Airtel / Moov</div>
            <div>Espèces acceptées</div>
          </div>
        </div>
        <div>
          <div style={{ color:TEAL, fontWeight:700, fontSize:10, borderBottom:`1px solid ${TEAL}`, paddingBottom:2, marginBottom:3 }}>
            CONDITIONS GÉNÉRALES
          </div>
          <div style={{ fontSize:9, lineHeight:1.4, color:DARK }}>
            <div>• Délai de paiement :</div>
            <div>• Pénalités : 1,5% / mois de retard</div>
            {tva === 0
              ? <div>• Items exonérés de TVA (CSS 1% maintenue) — CGI du Gabon</div>
              : <div>• TVA 18% et CSS 1% — CGI du Gabon</div>}
            <div>• Toute facture non contestée dans 8 jours est réputée acceptée.</div>
          </div>
        </div>
      </div>

      {/* ── SIGNATURES (compactes) ── */}
      <div style={{ height:1, background:TEAL, margin:'4px 0' }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:5 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, marginBottom:20 }}>Signature et cachet du client :</div>
          <div style={{ borderBottom:'1px solid #ccc', paddingBottom:2, fontSize:9, color:GRAY, fontStyle:'italic' }}>
            (Bon pour accord)
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:700, marginBottom:20 }}>Signature et cachet Galerie Médicale :</div>
          <div style={{ borderBottom:'1px solid #ccc', paddingBottom:2, fontSize:9, color:GRAY, fontStyle:'italic' }}>
            Fait à Libreville, le : _______________
          </div>
        </div>
      </div>

      {/* ── PIED DE PAGE ── */}
      <div style={{ height:3, background:TEAL, borderRadius:2, margin:'4px 0 3px' }} />
      <div style={{ fontSize:8, color:GRAY, textAlign:'center', lineHeight:1.4 }}>
        Société à Responsabilité Limitée au Capital de 10 000 000 FCFA &nbsp;|&nbsp;
        NIF : 49761L &nbsp;|&nbsp; RCCM : GA-LBV-01-2020-B12-00179
        <br/>
        ✆ (00241) 60202900 &nbsp;|&nbsp; ✉ acceuil@sajgroupe.com &nbsp;|&nbsp; 🌐 www.sajgroupe.com
      </div>

    </div>
  )
}
