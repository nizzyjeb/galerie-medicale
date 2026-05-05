import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, today, STATUTS_BL } from '../lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'

export default function BonsLivraison() {
  const { user } = useAuth()
  const [bls, setBls] = useState([])
  const [factures, setFactures] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ facture_id: '', date_livraison: today(), livreur: '', remarques: '' })
  const [lignesBL, setLignesBL] = useState([])

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const [{ data: b }, { data: f }] = await Promise.all([
      supabase.from('bons_livraison').select('*').order('created_at', { ascending: false }),
      supabase.from('factures').select('id,numero,client_nom,statut').in('type',['facture','proforma']).order('created_at', { ascending:false }),
    ])
    setBls(b || [])
    setFactures(f || [])
    setLoading(false)
  }

  const onSelectFacture = async (factureId) => {
    setForm(f => ({ ...f, facture_id: factureId }))
    if (!factureId) { setLignesBL([]); return }
    const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', parseInt(factureId))
    setLignesBL((lignes || []).map(l => ({ ...l, qte_livree: l.quantite, statut_ligne: 'attente', observation: '' })))
  }

  const toggleStatutLigne = (i) => {
    setLignesBL(prev => prev.map((l, idx) => idx === i
      ? { ...l, statut_ligne: l.statut_ligne === 'livre' ? 'attente' : 'livre' }
      : l))
  }

  const handleSave = async () => {
    if (!form.facture_id) { toast.error('Sélectionnez une facture'); return }
    const facture = factures.find(f => f.id === parseInt(form.facture_id))
    const livrees = lignesBL.filter(l => l.statut_ligne === 'livre').length
    const total = lignesBL.length
    const statut = livrees === total && total > 0 ? 'complet' : livrees === 0 ? 'attente' : 'partiel'

    const { count } = await supabase.from('bons_livraison').select('*', { count:'exact', head:true })
    const numero = `BL-${String((count||0)+1).padStart(3,'0')}-${new Date().getFullYear()}`

    const { data: bl } = await supabase.from('bons_livraison').insert({
      numero, facture_id: parseInt(form.facture_id),
      client_nom: facture?.client_nom || '',
      date_livraison: form.date_livraison,
      livreur: form.livreur, statut, remarques: form.remarques,
      created_by: user.id,
    }).select().single()

    if (bl && lignesBL.length > 0) {
      await supabase.from('bl_lignes').insert(lignesBL.map(l => ({
        bl_id: bl.id, designation: l.designation,
        qte_commandee: l.quantite, qte_livree: l.qte_livree,
        unite: 'Forfait', statut_ligne: l.statut_ligne, observation: l.observation,
      })))
    }

    toast.success(`Bon de livraison ${numero} créé !`)
    setShowModal(false)
    setForm({ facture_id:'', date_livraison:today(), livreur:'', remarques:'' })
    setLignesBL([])
    fetchAll()
  }

  const updateStatut = async (id, statut) => {
    await supabase.from('bons_livraison').update({ statut }).eq('id', id)
    setBls(prev => prev.map(b => b.id===id ? {...b,statut} : b))
    toast.success('Statut mis à jour')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:18, fontWeight:600 }}>Bons de livraison</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouveau BL</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N° BL</th><th>Facture liée</th><th>Client</th><th>Date livraison</th><th>Livreur</th><th>Statut</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Chargement...</td></tr>
              ) : bls.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Aucun bon de livraison</td></tr>
              ) : bls.map(b => {
                const st = STATUTS_BL[b.statut] || STATUTS_BL.attente
                return (
                  <tr key={b.id}>
                    <td className="font-mono" style={{ color:'var(--teal)', fontWeight:600 }}>{b.numero}</td>
                    <td className="font-mono" style={{ color:'var(--gray)' }}>{b.facture_id || '—'}</td>
                    <td style={{ fontWeight:500 }}>{b.client_nom}</td>
                    <td style={{ color:'var(--gray)' }}>{fmtDate(b.date_livraison)}</td>
                    <td style={{ color:'var(--gray)' }}>{b.livreur || '—'}</td>
                    <td><span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span></td>
                    <td>
                      <select style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)' }}
                        value={b.statut} onChange={e => updateStatut(b.id, e.target.value)}>
                        <option value="attente">En attente</option>
                        <option value="partiel">Partiel</option>
                        <option value="complet">Complet</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="card-title">Nouveau Bon de Livraison</div>
              <button onClick={() => setShowModal(false)} style={{ background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--gray)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2 mb-4">
                <div className="form-group">
                  <label>Facture / Pro Forma liée *</label>
                  <select value={form.facture_id} onChange={e => onSelectFacture(e.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {factures.map(f => <option key={f.id} value={f.id}>{f.numero} — {f.client_nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date de livraison</label>
                  <input type="date" value={form.date_livraison} onChange={e => setForm(f=>({...f,date_livraison:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Livreur / Responsable</label>
                  <input placeholder="Nom du livreur" value={form.livreur} onChange={e => setForm(f=>({...f,livreur:e.target.value}))} />
                </div>
              </div>

              {lignesBL.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="card-title mb-4">Articles — cochez ce qui est livré</div>
                  {lignesBL.map((l, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f3f4f6' }}>
                      <div onClick={() => toggleStatutLigne(i)} style={{
                        width:22, height:22, borderRadius:6, flexShrink:0, cursor:'pointer',
                        border: l.statut_ligne==='livre' ? 'none' : '2px solid var(--border)',
                        background: l.statut_ligne==='livre' ? 'var(--success)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13
                      }}>
                        {l.statut_ligne==='livre' && '✓'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:500, fontSize:13 }}>{l.designation}</div>
                        <div style={{ fontSize:11, color:'var(--gray)' }}>Qté commandée : {l.quantite}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {lignesBL.length === 0 && form.facture_id && (
                <div className="alert alert-warn">Aucun article trouvé dans cette facture.</div>
              )}
              {!form.facture_id && (
                <div className="alert alert-info">Sélectionnez une facture pour charger les articles automatiquement.</div>
              )}

              <div className="divider" />
              <div className="form-group">
                <label>Remarques / Réserves</label>
                <textarea placeholder="Observations sur la livraison..." value={form.remarques}
                  onChange={e => setForm(f=>({...f,remarques:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave}>Créer le BL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
