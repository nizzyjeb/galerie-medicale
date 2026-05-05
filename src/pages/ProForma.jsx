import { useState, useEffect } from 'react'
import PrintDocument from '../components/PrintDocument'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, today, addDays, STATUTS_FACTURE } from '../lib/utils'
import FactureModal from '../components/FactureModal'
import { exportFacturesExcel } from '../lib/exportExcel'
import EditFactureModal from '../components/EditFactureModal'
import toast from 'react-hot-toast'

export default function ProForma() {
  const [proformas, setProformas] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [editDoc, setEditDoc] = useState(null)

  useEffect(() => { fetchPF() }, [])

  const fetchPF = async () => {
    const { data } = await supabase.from('factures').select('*')
      .eq('type', 'proforma').order('created_at', { ascending: false })
    setProformas(data || [])
    setLoading(false)
  }

  const openPreview = async (pf) => {
    const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', pf.id).order('ordre')
    setPreviewDoc({ ...pf, lignes: lignes || [] })
  }

  const convertirEnFacture = async (pf) => {
    if (!window.confirm(`Convertir ${pf.numero} en facture définitive ?`)) return
    const { count } = await supabase.from('factures').select('*', { count: 'exact', head: true }).eq('type', 'facture')
    const numero = `FACT-${String((count || 0) + 1).padStart(3, '0')}-${new Date().getFullYear()}`
    const { data: newFact } = await supabase.from('factures').insert({
      ...pf, id: undefined, numero, type: 'facture',
      statut: 'attente', date_emission: today(),
      date_echeance: addDays(today(), 30), created_at: undefined, updated_at: undefined
    }).select().single()
    if (newFact) {
      const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', pf.id)
      if (lignes?.length) {
        await supabase.from('facture_lignes').insert(lignes.map(l => ({ ...l, id: undefined, facture_id: newFact.id })))
      }
      await supabase.from('factures').update({ statut: 'en_cours' }).eq('id', pf.id)
      toast.success(`Facture ${numero} créée depuis ${pf.numero}`)
      fetchPF()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Pro Forma</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => exportFacturesExcel(proformas, 'proforma')} title="Exporter les pro formas">
            📥 Export Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle pro forma</button>
        </div>
      </div>

      <div className="alert alert-info mb-4">
        La pro forma est un document de devis non fiscal. Elle peut être convertie en facture définitive en un clic.
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N°</th><th>Client</th><th>Objet</th><th>Date</th><th>Validité</th><th>Montant TTC</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : proformas.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucune pro forma</td></tr>
              ) : proformas.map(p => {
                const st = STATUTS_FACTURE[p.statut] || STATUTS_FACTURE.en_cours
                return (
                  <tr key={p.id}>
                    <td className="font-mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{p.numero}</td>
                    <td style={{ fontWeight: 500 }}>{p.client_nom}</td>
                    <td style={{ color: 'var(--gray)' }}>{p.objet}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(p.date_emission)}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(p.date_echeance)}</td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{fmt(p.total_ttc)}</td>
                    <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditDoc(p)}>✏️ Modifier</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPreview(p)}>
                          👁 Aperçu
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => convertirEnFacture(p)} style={{ whiteSpace: 'nowrap' }}>
                          → Facture
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editDoc && <EditFactureModal doc={editDoc} onClose={() => setEditDoc(null)} onSaved={fetchPF} />}
      {showModal && <FactureModal type="proforma" onClose={() => setShowModal(false)} onSaved={fetchPF} />}
      {previewDoc && <PrintDocument doc={previewDoc} type="proforma" onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}
