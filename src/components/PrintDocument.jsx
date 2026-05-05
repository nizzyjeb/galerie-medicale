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
  const [commercialTel, setCommercialTel] = useState('')
  const [commercialEmail, setCommercialEmail] = useState('')
  const isProforma = type === 'proforma'
  const titre = isProforma ? 'FACTURE PRO FORMA' : 'FACTURE'
  const numero = doc.numero || '—'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
      display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'16px' }}>

      <style>{`
        @media print {
          /* Masquer TOUT sauf la zone d'impression */
          body > * { display: none !important; }
          #print-root { display: block !important; position: fixed !important;
            inset: 0 !important; background: white !important; overflow: visible !important; }
          .no-print { display: none !important; }
          /* Supprimer URL et en-têtes du navigateur */
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
        }
        @page { size: A4; margin: 10mm 12mm 10mm 12mm; }
      `}</style>

      {/* Zone qui sera visible à l'impression */}
      <div id="print-root" style={{ display:'none' }}>
        <DocumentContent
          doc={doc} lignes={lignes} sousTotal={sousTotal} remisePct={remisePct}
          remise={remise} base={base} tva={tva} css={css} ttc={ttc}
          isProforma={isProforma} titre={titre} numero={numero}
        />
      </div>

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
          />
        </div>
      </div>
    </div>
  )
}

function DocumentContent({ doc, lignes, sousTotal, remisePct, remise, base, tva, css, ttc, isProforma, titre, numero, commercialTel, commercialEmail }) {
  const TEAL = '#1A9E8F'
  const TEAL_L = '#E8F6F5'
  const TEAL_M = '#B2DED9'
  const DARK = '#2C2C2C'
  const GRAY = '#6D6D6D'

  // Compléter jusqu'à 10 lignes
  const totalLignes = 10
  const lignesAffichees = [
    ...lignes,
    ...Array.from({ length: Math.max(0, totalLignes - lignes.length) }).map(() => null)
  ]

  return (
    <div style={{ fontFamily:'Arial, sans-serif', fontSize:11, color:DARK, background:'#fff' }}>

      {/* ── EN-TÊTE : Logo gauche + Société centre ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
        <img src={LOGO_BASE64} alt="Galerie Médicale" style={{ height:220, objectFit:'contain' }} />
        <div style={{ flex:1, textAlign:'center', padding:'8px 20px 0' }}>
          <div style={{ fontSize:18, fontWeight:700, color:TEAL, letterSpacing:1 }}>GALERIE MÉDICALE</div>
          <div style={{ fontSize:10, color:GRAY, marginTop:2 }}>
            Tél. : (00241) 60202900 | Acceuil@sajgroupe.com | www.sajgroupe.com
          </div>
        </div>
        <div style={{ width:120 }} />
      </div>

      {/* Barre teal */}
      <div style={{ height:5, background:TEAL, borderRadius:2, margin:'8px 0' }} />

      {/* ── TITRE + N° ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'8px 0 6px' }}>
        <div style={{ background:'#e5e7eb', padding:'5px 20px', borderRadius:4 }}>
          <span style={{ fontSize:20, fontWeight:900, color:TEAL, letterSpacing:2 }}>{titre}</span>
        </div>
        <div style={{ background:'#e5e7eb', padding:'5px 18px', borderRadius:4 }}>
          <span style={{ fontSize:14, fontWeight:700, color:DARK }}>N° {numero}</span>
        </div>
      </div>

      {/* ── BLOC DATES/OBJET (aligné à droite comme le modèle) ── */}
      <table style={{ width:'55%', marginLeft:'auto', borderCollapse:'collapse', marginBottom:10, fontSize:11 }}>
        <tbody>
          {[
            ["Date d'émission :", fmtDate(doc.date_emission)],
            ["N° de " + (isProforma ? "Pro Forma" : "Facture") + " :", numero],
            ["Date d'échéance :", fmtDate(doc.date_echeance)],
            ["Objet :", doc.objet || ''],
          ].map(([label, val]) => (
            <tr key={label}>
              <td style={{ padding:'2px 10px', fontWeight:700, borderBottom:'1px solid #e5e7eb', width:'45%' }}>{label}</td>
              <td style={{ padding:'2px 10px', borderBottom:'1px solid #e5e7eb' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── ÉMETTEUR / CLIENT ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:8 }}>
        {/* Émetteur */}
        <div>
          <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:11,
            padding:'5px 10px', textAlign:'center', borderRadius:'4px 4px 0 0' }}>ÉMETTEUR</div>
          <div style={{ border:`1px solid ${TEAL}`, borderTop:'none', padding:'8px 10px', fontSize:11, lineHeight:1.8 }}>
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
          <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:11,
            padding:'5px 10px', textAlign:'center', borderRadius:'4px 4px 0 0' }}>CLIENT / DESTINATAIRE</div>
          <div style={{ border:`1px solid ${TEAL}`, borderTop:'none', padding:'8px 10px', fontSize:11, lineHeight:1.8 }}>
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
      <div style={{ background:TEAL, color:'#fff', fontWeight:700, fontSize:11,
        padding:'5px 10px', textAlign:'center', marginBottom:0 }}>
        DÉTAIL DES PRESTATIONS
      </div>

      {/* ── TABLEAU PRESTATIONS ── */}
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:8 }}>
        <thead>
          <tr style={{ background:TEAL_M }}>
            {[['N°','30px','center'],['Désignation / Prestation','','left'],
              ['Qté','50px','center'],['Unité','70px','center'],
              ['P.U. (FCFA)','110px','right'],['Total HT','115px','right']].map(([h,w,a]) => (
              <th key={h} style={{ padding:'6px 8px', fontSize:10, fontWeight:700, color:DARK,
                borderBottom:`2px solid ${TEAL}`, width:w||'auto', textAlign:a }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignesAffichees.map((l, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? TEAL_L : '#fff' }}>
              <td style={{ padding:'5px 8px', fontSize:10, textAlign:'center', borderBottom:'1px solid #e5e7eb', color:GRAY }}>{i+1}</td>
              <td style={{ padding:'5px 8px', fontSize:10, borderBottom:'1px solid #e5e7eb' }}>{l?.designation || ''}</td>
              <td style={{ padding:'5px 8px', fontSize:10, textAlign:'center', borderBottom:'1px solid #e5e7eb' }}>{l?.quantite || ''}</td>
              <td style={{ padding:'5px 8px', fontSize:10, textAlign:'center', fontStyle:'italic', color:GRAY, borderBottom:'1px solid #e5e7eb' }}>Forfait</td>
              <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', fontFamily:'monospace', borderBottom:'1px solid #e5e7eb' }}>
                {l ? fmt(l.prix_unitaire) : ''}
              </td>
              <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', fontFamily:'monospace', fontWeight:600, borderBottom:'1px solid #e5e7eb' }}>
                {l ? fmt(l.total_ht) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── TOTAUX ── */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
        <table style={{ width:300, borderCollapse:'collapse', fontSize:11 }}>
          <tbody>
            {[
              ['Sous-total HT :', fmt(sousTotal)],
              ['Remise (%) :', (remisePct||0).toFixed(1) + '%'],
              ['Montant remise :', fmt(remise)],
              ['Base HT après remise :', fmt(base)],
              ['TVA (18%) :', fmt(tva)],
              ['CSS (1%) :', fmt(css)],
            ].map(([label, val]) => (
              <tr key={label}>
                <td style={{ padding:'3px 8px', borderBottom:'1px solid #e5e7eb', textAlign:'right', color:GRAY }}>{label}</td>
                <td style={{ padding:'3px 8px', fontFamily:'monospace', borderBottom:'1px solid #e5e7eb', textAlign:'right' }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
        <div style={{ width:300, background:TEAL, color:'#fff', display:'flex',
          justifyContent:'space-between', padding:'7px 8px', fontWeight:700, fontSize:13, borderRadius:4 }}>
          <span>TOTAL TTC :</span>
          <span style={{ fontFamily:'monospace' }}>{fmt(ttc)}</span>
        </div>
      </div>

      {/* ── ARRÊTÉ ── */}
      <div style={{ fontSize:11, fontStyle:'italic', marginBottom:8, padding:'5px 10px',
        background:'#f9f9f9', borderLeft:`3px solid ${TEAL}` }}>
        {isProforma
          ? <>Estimation arrêtée à la somme de : <strong>{fmt(ttc)}</strong> FCFA TTC (sous réserve de validation)</>
          : <>Arrêtée la présente facture à la somme de : <strong>[Montant en lettres]</strong> FCFA TTC</>
        }
      </div>

      {/* ── MODALITÉS / CONDITIONS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ color:TEAL, fontWeight:700, fontSize:11, borderBottom:`1px solid ${TEAL}`, paddingBottom:3, marginBottom:5 }}>
            MODALITÉS DE PAIEMENT
          </div>
          <div style={{ fontSize:10, lineHeight:1.9, color:DARK }}>
            <div>Virement bancaire :</div>
            <div style={{ paddingLeft:8 }}>Banque : ORABANK</div>
            <div style={{ paddingLeft:8 }}>N° Compte : 40021 01000 21953600201 25</div>
            <div style={{ paddingLeft:8 }}>Libellé : Fact. N° {numero}</div>
            <div>Mobile Money : Airtel / Moov</div>
            <div>Espèces acceptées</div>
          </div>
        </div>
        <div>
          <div style={{ color:TEAL, fontWeight:700, fontSize:11, borderBottom:`1px solid ${TEAL}`, paddingBottom:3, marginBottom:5 }}>
            CONDITIONS GÉNÉRALES
          </div>
          <div style={{ fontSize:10, lineHeight:1.9, color:DARK }}>
            <div>• Délai de paiement :</div>
            <div>• Pénalités : 1,5% / mois de retard</div>
            <div>• TVA 18% et CSS 1% — CGI du Gabon</div>
            <div>• Toute facture non contestée dans 8 jours</div>
            <div style={{ paddingLeft:8 }}>est réputée acceptée.</div>
          </div>
        </div>
      </div>

      {/* ── SIGNATURES ── */}
      <div style={{ height:1, background:TEAL, margin:'8px 0' }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:30, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, marginBottom:40 }}>Signature et cachet du client :</div>
          <div style={{ borderBottom:'1px solid #ccc', paddingBottom:3, fontSize:10, color:GRAY, fontStyle:'italic' }}>
            (Bon pour accord)
          </div>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, marginBottom:40 }}>Signature et cachet Galerie Médicale :</div>
          <div style={{ borderBottom:'1px solid #ccc', paddingBottom:3, fontSize:10, color:GRAY, fontStyle:'italic' }}>
            Fait à Libreville, le : _______________
          </div>
        </div>
      </div>

      {/* ── PIED DE PAGE : identique au modèle Excel ── */}
      <div style={{ height:4, background:TEAL, borderRadius:2, margin:'8px 0 5px' }} />
      <div style={{ fontSize:9, color:GRAY, textAlign:'center', lineHeight:1.6 }}>
        Société à Responsabilité Limitée au Capital de 10 000 000 FCFA &nbsp;|&nbsp;
        NIF : 49761L &nbsp;|&nbsp; RCCM : GA-LBV-01-2020-B12-00179
        <br/>
        ✆ (00241) 60202900 &nbsp;|&nbsp; ✉ acceuil@sajgroupe.com &nbsp;|&nbsp; 🌐 www.sajgroupe.com
      </div>

    </div>
  )
}
