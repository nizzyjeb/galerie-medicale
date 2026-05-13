import { useState, useEffect } from 'react'
import PrintDocument from '../components/PrintDocument'
import ContextMenu from '../components/ContextMenu'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, STATUTS_FACTURE } from '../lib/utils'
import FactureModal from '../components/FactureModal'
import { exportFacturesExcel, exportRegistreExcel } from '../lib/exportExcel'
import EditFactureModal from '../components/EditFactureModal'
import toast from 'react-hot-toast'

export default function Factures() {
  const { user, profile, isAdmin } = useAuth()
  const [factures, setFactures] = useState([])
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
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

  // ★ NOUVEAU : Validation d'une facture par l'admin uniquement
  const validerFacture = async (id, numero) => {
    if (!window.confirm(`Valider définitivement la facture ${numero} ?\n\nUne fois validée, elle ne pourra plus être modifiée par le comptable.\nCette action est irréversible.`)) return

    const { error } = await supabase
      .from('factures')
      .update({
        valide: true,
        valide_par: user.id,
        date_validation: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      toast.error('Erreur : ' + error.message)
    } else {
      toast.success(`Facture ${numero} validée ✓`)
      fetchFactures()
    }
  }

  const deleteFacture = async (id, numero) => {
    if (!window.confirm(`Supprimer définitivement la facture ${numero} ? Cette action est irréversible.`)) return
    await supabase.from('facture_lignes').delete().eq('facture_id', id)
    await supabase.from('factures').delete().eq('id', id)
    toast.success(`Facture ${numero} supprimée`)
    fetchFactures()
  }

  const handleContextMenu = (e, f) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: '👁', label: 'Aperçu / Imprimer', action: () => openPreview(f) },
        { icon: '✏️', label: 'Modifier', action: () => setEditDoc(f) },
        // ★ NOUVEAU : Option Valider dans le menu contextuel (admin + non validée)
        ...(isAdmin && !f.valide ? [
          'divider',
          { icon: '✓', label: 'Valider définitivement', action: () => validerFacture(f.id, f.numero) }
        ] : []),
        'divider',
        { icon: '💰', label: 'Marquer Payée', action: () => changeStatut(f.id, 'payee') },
        { icon: '⏳', label: 'Marquer En attente', action: () => changeStatut(f.id, 'attente') },
        { icon: '🔴', label: 'Marquer En retard', action: () => changeStatut(f.id, 'retard') },
        ...(isAdmin ? [
          'divider',
          { icon: '🗑', label: 'Supprimer la facture', action: () => deleteFacture(f.id, f.numero), danger: true }
        ] : [])
      ]
    })
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

      {/* ★ NOUVEAU : Bandeau d'info pour le comptable */}
      {!isAdmin && profile?.role === 'comptable' && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
          fontSize: 13
        }}>
          ℹ️ Les factures que vous créez doivent être validées par un administrateur pour devenir définitives.
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N°</th><th>Client</th><th>Objet</th><th>Émission</th><th>Échéance</th><th>HT</th><th>TTC</th><th>Validation</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucune facture</td></tr>
              ) : filtered.map(f => {
                const st = STATUTS_FACTURE[f.statut] || STATUTS_FACTURE.attente
                return (
                  <tr key={f.id} onContextMenu={e => handleContextMenu(e, f)} style={{ cursor:'context-menu' }}>
                    <td className="font-mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{f.numero}</td>
                    <td style={{ fontWeight: 500 }}>{f.client_nom}</td>
                    <td style={{ color: 'var(--gray)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.objet}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(f.date_emission)}</td>
                    <td style={{ color: f.statut === 'retard' ? 'var(--danger)' : 'var(--gray)' }}>{fmtDate(f.date_echeance)}</td>
                    <td className="font-mono">{fmt(f.base_ht)}</td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{fmt(f.total_ttc)}</td>
                    {/* ★ NOUVEAU : Colonne Validation */}
                    <td>
                      {f.valide ? (
                        <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✓ Validée</span>
                      ) : (
                        <span className="badge" style={{ background: '#fed7aa', color: '#9a3412' }}>⏳ En attente</span>
                      )}
                    </td>
                    <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPreview(f)}>👁 Aperçu</button>
                        {/* Modifier : admin toujours, comptable seulement si non validée */}
                        {(isAdmin || !f.valide) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditDoc(f)}>✏️ Modifier</button>
                        )}
                        {/* ★ NOUVEAU : Bouton Valider - admin uniquement, facture non validée */}
                        {isAdmin && !f.valide && (
                          <button
                            className="btn btn-sm"
                            style={{ background: '#16a34a', color: 'white', border: 'none', fontWeight: 600 }}
                            onClick={() => validerFacture(f.id, f.numero)}
                            title="Valider définitivement cette facture"
                          >
                            ✓ Valider
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn btn-danger btn-sm" onClick={() => deleteFacture(f.id, f.numero)}>🗑 Suppr.</button>
                        )}
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
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
