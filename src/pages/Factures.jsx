import { useState, useEffect } from 'react'
import PrintDocument from '../components/PrintDocument'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, STATUTS_FACTURE } from '../lib/utils'
import FactureModal from '../components/FactureModal'
import { exportFacturesExcel, exportRegistreExcel } from '../lib/exportExcel'
import EditFactureModal from '../components/EditFactureModal'
import toast from 'react-hot-toast'

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
      {previewDoc && <PrintDocument doc={previewDoc} type="facture" onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}
