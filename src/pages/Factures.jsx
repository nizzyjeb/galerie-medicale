import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, STATUTS_FACTURE } from '../lib/utils'
import FactureModal from '../components/FactureModal'
import { exportFacturesExcel, exportRegistreExcel } from '../lib/exportExcel'
import EditFactureModal from '../components/EditFactureModal'
import toast from 'react-hot-toast'

function PrintModal({ doc, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const lignes = doc.lignes || []
  const tva = doc.tva || 0
  const css = doc.css || 0
  const ht = doc.base_ht || 0
  const ttc = doc.total_ttc || 0
  const remise = doc.montant_remise || 0
  const sousTotal = doc.sous_total_ht || 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', overflowY: 'auto', padding: '20px'
    }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-zone, #print-zone * { visibility: visible !important; }
          #print-zone { position: fixed !important; inset: 0 !important; background: white !important; padding: 20px !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div className="no-print" style={{
          padding: '14px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 1
        }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Aperçu — {doc.numero}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
            <button onClick={() => window.print()} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: '#1A9E8F', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              🖨️ Imprimer / PDF
            </button>
          </div>
        </div>

        <div id="print-zone" style={{ padding: '36px 48px', fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#2C2C2C' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <img src="/logo.png" alt="Galerie Médicale" style={{ height: 70, objectFit: "contain" }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#6D6D6D', lineHeight: 1.7 }}>
              <div>Gallerie Océane, Libreville, Gabon</div>
              <div>Tél. : (00241) 60202900</div>
              <div>acceuil@sajgroupe.com</div>
              <div>NIF : 49761L | RCCM : GA-MBV-01-2020-B12-00179</div>
            </div>
          </div>

          <div style={{ height: 4, background: '#1A9E8F', borderRadius: 2, margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1A9E8F' }}>FACTURE</div>
            <div style={{ background: '#F5F5F5', borderRadius: 8, padding: '12px 20px', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#6D6D6D' }}>N° Facture</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A9E8F' }}>{doc.numero}</div>
              <div style={{ fontSize: 11, color: '#6D6D6D', marginTop: 6 }}>Date d'émission</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(doc.date_emission)}</div>
              <div style={{ fontSize: 11, color: '#6D6D6D', marginTop: 4 }}>Date d'échéance</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(doc.date_echeance)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
            <div style={{ background: '#E8F6F5', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#1A9E8F', padding: '4px 10px', borderRadius: 4, display: 'inline-block', marginBottom: 10 }}>ÉMETTEUR</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Galerie Médicale – SAJ Groupe</div>
              <div style={{ color: '#6D6D6D', fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
                <div>Gallerie Océane, Libreville, Gabon</div>
                <div>Tél. : (00241) 60202900</div>
                <div>NIF : 49761L | RCCM : GA-MBV-01-2020-B12-00179</div>
                <div>ORABANK : 40021 01000 21953600201 25</div>
              </div>
            </div>
            <div style={{ border: '2px solid #1A9E8F', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1A9E8F', marginBottom: 10 }}>CLIENT / DESTINATAIRE</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.client_nom}</div>
              <div style={{ color: '#6D6D6D', fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
                {doc.client_adresse && <div>{doc.client_adresse}</div>}
                <div>Pays : Gabon</div>
                {doc.client_nif && <div>NIF : {doc.client_nif}</div>}
              </div>
            </div>
          </div>

          {doc.objet && (
            <div style={{ marginBottom: 20, padding: '8px 14px', background: '#f9fafb', borderRadius: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Objet : </span>{doc.objet}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#1A9E8F' }}>
                {['N°', 'Désignation', 'Qté', 'P.U. (FCFA)', 'Total HT (FCFA)'].map((h, i) => (
                  <th key={i} style={{ padding: '9px 12px', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: i > 1 ? 'right' : i === 0 ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#E8F6F5' : '#fff' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6D6D6D', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12 }}>{l.designation}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>{l.quantite}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>{fmt(l.prix_unitaire)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.total_ht)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ minWidth: 300 }}>
              {[['Sous-total HT', sousTotal], ['Remise', -remise], ['Base HT après remise', ht], ['TVA 18%', tva], ['CSS 1%', css]].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ color: '#6D6D6D' }}>{label}</span>
                  <span style={{ fontFamily: 'monospace' }}>{fmt(Math.abs(val))}</span>
                </div>
              ))}
              <div style={{ background: '#1A9E8F', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>TOTAL TTC</span>
                <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }}>{fmt(ttc)}</span>
              </div>
            </div>
          </div>

          <div style={{ background: '#E8F6F5', borderRadius: 6, padding: '10px 14px', fontSize: 12, fontStyle: 'italic', marginBottom: 24 }}>
            Arrêtée la présente facture à la somme de : <strong>{fmt(ttc)}</strong> FCFA TTC
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1A9E8F', borderBottom: '2px solid #1A9E8F', paddingBottom: 4, marginBottom: 8 }}>MODALITÉS DE PAIEMENT</div>
              {['Virement bancaire : ORABANK', 'N° Compte : 40021 01000 21953600201 25', 'Libellé : Fact. N° ' + doc.numero, 'Mobile Money : Airtel / Moov', 'Espèces acceptées'].map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: '#444', marginBottom: 3 }}>• {c}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1A9E8F', borderBottom: '2px solid #1A9E8F', paddingBottom: 4, marginBottom: 8 }}>CONDITIONS GÉNÉRALES</div>
              {['Paiement dû dans un délai de 30 jours.', 'Pénalités : 1,5% / mois de retard.', 'TVA 18% et CSS 1% — CGI du Gabon.', 'Tribunal compétent : Libreville.'].map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: '#444', marginBottom: 3 }}>• {c}</div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 20 }}>
            {['Signature du client (bon pour accord)', 'Signature et cachet Galerie Médicale'].map((label, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 40 }}>{label} :</div>
                <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 4, fontSize: 11, color: '#6D6D6D' }}>
                  {i === 1 ? `Fait à Libreville, le ${fmtDate(doc.date_emission)}` : '(Nom & fonction)'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 3, background: '#1A9E8F', borderRadius: 2, margin: '16px 0 10px' }} />
          <div style={{ fontSize: 10, color: '#6D6D6D', textAlign: 'center' }}>
            ✆ (00241) 60202900  |  ✉ acceuil@sajgroupe.com  |  🌐 www.sajgroupe.com  |  NIF : 49761L  |  RCCM : GA-MBV-01-2020-B12-00179
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Factures() {
  const [factures, setFactures] = useState([])
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [editDoc, setEditDoc] = useState(null)

  useEffect(() => { fetchFactures() }, [])

  const fetchFactures = async () => {
    const { data } = await supabase.from('factures').select('*').eq('type', 'facture').order('created_at', { ascending: false })
    setFactures(data || [])
    setLoading(false)
  }

  const openPreview = async (f) => {
    const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', f.id).order('ordre')
    setPreviewDoc({ ...f, lignes: lignes || [] })
  }

  const changeStatut = async (id, statut) => {
    await supabase.from('factures').update({ statut }).eq('id', id)
    setFactures(prev => prev.map(f => f.id === id ? { ...f, statut } : f))
    toast.success('Statut mis à jour')
  }

  const filtered = filter === 'all' ? factures : factures.filter(f => f.statut === filter)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Factures</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => exportFacturesExcel(factures, 'facture')} title="Exporter les factures en Excel/CSV">
            📥 Export Excel
          </button>
          <button className="btn btn-ghost" onClick={() => exportRegistreExcel([...factures])} title="Exporter le registre complet">
            📋 Registre
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle facture</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--lgray)', padding: 4, borderRadius: 10, marginBottom: 20, width: 'fit-content' }}>
        {[['all', 'Toutes'], ['attente', 'En attente'], ['payee', 'Payées'], ['retard', 'En retard']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: filter === val ? '#fff' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--gray)',
            boxShadow: filter === val ? 'var(--shadow-sm)' : 'none'
          }}>{label}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N°</th><th>Client</th><th>Objet</th><th>Émission</th><th>Échéance</th><th>HT</th><th>TTC</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucune facture</td></tr>
              ) : filtered.map(f => {
                const st = STATUTS_FACTURE[f.statut] || STATUTS_FACTURE.attente
                return (
                  <tr key={f.id}>
                    <td className="font-mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{f.numero}</td>
                    <td style={{ fontWeight: 500 }}>{f.client_nom}</td>
                    <td style={{ color: 'var(--gray)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.objet}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(f.date_emission)}</td>
                    <td style={{ color: f.statut === 'retard' ? 'var(--danger)' : 'var(--gray)' }}>{fmtDate(f.date_echeance)}</td>
                    <td className="font-mono">{fmt(f.base_ht)}</td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{fmt(f.total_ttc)}</td>
                    <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPreview(f)}>👁 Aperçu</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditDoc(f)}>✏️ Modifier</button>
                        <select style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                          value={f.statut} onChange={e => changeStatut(f.id, e.target.value)}>
                          <option value="attente">En attente</option>
                          <option value="payee">Payée</option>
                          <option value="retard">En retard</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <FactureModal type="facture" onClose={() => setShowModal(false)} onSaved={fetchFactures} />}
      {editDoc && <EditFactureModal doc={editDoc} onClose={() => setEditDoc(null)} onSaved={fetchFactures} />}
      {previewDoc && <PrintModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}
