import { useState, useEffect } from 'react'
import LOGO_BASE64 from '../lib/logo.js'
import { supabase } from '../lib/supabase'
import { fmtDate, today, STATUTS_BL } from '../lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth.jsx'

function PrintBL({ bl, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const livrees = bl.lignes?.filter(l => l.statut_ligne === 'livre').length || 0
  const total = bl.lignes?.length || 0
  const statut = livrees === total && total > 0 ? 'LIVRAISON COMPLÈTE' : livrees === 0 ? 'EN ATTENTE' : 'LIVRAISON PARTIELLE'
  const statutColor = livrees === total && total > 0 ? '#16a34a' : livrees === 0 ? '#d97706' : '#2563eb'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-bl, #print-bl * { visibility: visible !important; }
          #print-bl { position: fixed !important; inset: 0 !important; background: white !important; padding: 20px !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:780, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        {/* Barre actions */}
        <div className="no-print" style={{ padding:'14px 24px', borderBottom:'1px solid #e5e7eb', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'#fff', borderRadius:'12px 12px 0 0', zIndex:1 }}>
          <div style={{ fontWeight:600, fontSize:15 }}>Aperçu BL — {bl.numero}</div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ padding:'7px 16px', borderRadius:8, border:'1px solid #e5e7eb', background:'transparent', cursor:'pointer', fontSize:13 }}>Fermer</button>
            <button onClick={() => window.print()} style={{ padding:'7px 20px', borderRadius:8, border:'none', background:'#1A9E8F', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:500 }}>
              🖨️ Imprimer / PDF
            </button>
          </div>
        </div>

        {/* Document */}
        <div id="print-bl" style={{ padding:'36px 48px', fontFamily:'Arial, sans-serif', fontSize:13, color:'#2C2C2C' }}>

          {/* En-tête */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
            <img src={LOGO_BASE64} alt="Galerie Médicale" style={{ height:70, objectFit:'contain' }} />
            <div style={{ textAlign:'right', fontSize:11, color:'#6D6D6D', lineHeight:1.7 }}>
              <div>Gallerie Océane, Libreville, Gabon</div>
              <div>Tél. : (00241) 60202900</div>
              <div>acceuil@sajgroupe.com</div>
              <div>NIF : 49761L | RCCM : GA-LBV-01-2020-B12-00179</div>
            </div>
          </div>

          <div style={{ height:4, background:'#1A9E8F', borderRadius:2, margin:'12px 0' }} />

          {/* Titre + infos */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'20px 0 24px' }}>
            <div>
              <div style={{ fontSize:26, fontWeight:700, color:'#1A9E8F' }}>BON DE LIVRAISON</div>
              <div style={{ marginTop:6, display:'inline-block', background:statutColor+'18', color:statutColor, padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                {statut}
              </div>
            </div>
            <div style={{ background:'#F5F5F5', borderRadius:8, padding:'12px 20px', textAlign:'right' }}>
              <div style={{ fontSize:11, color:'#6D6D6D' }}>N° BL</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#1A9E8F' }}>{bl.numero}</div>
              {bl.facture_num && <>
                <div style={{ fontSize:11, color:'#6D6D6D', marginTop:6 }}>Facture liée</div>
                <div style={{ fontSize:13, fontWeight:600 }}>{bl.facture_num}</div>
              </>}
              <div style={{ fontSize:11, color:'#6D6D6D', marginTop:6 }}>Date de livraison</div>
              <div style={{ fontSize:13, fontWeight:600 }}>{fmtDate(bl.date_livraison)}</div>
            </div>
          </div>

          {/* Expéditeur / Destinataire */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:28 }}>
            <div style={{ background:'#E8F6F5', borderRadius:8, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#1A9E8F', padding:'4px 10px', borderRadius:4, display:'inline-block', marginBottom:10 }}>EXPÉDITEUR</div>
              <div style={{ fontWeight:700, fontSize:13 }}>Galerie Médicale – SAJ Groupe</div>
              <div style={{ color:'#6D6D6D', fontSize:12, marginTop:4, lineHeight:1.7 }}>
                <div>Gallerie Océane, Libreville, Gabon</div>
                <div>Tél. : (00241) 60202900</div>
                {bl.livreur && <div style={{ marginTop:4 }}>Livreur : <strong>{bl.livreur}</strong></div>}
              </div>
            </div>
            <div style={{ border:'2px solid #1A9E8F', borderRadius:8, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#1A9E8F', marginBottom:10 }}>DESTINATAIRE / CLIENT</div>
              <div style={{ fontWeight:700, fontSize:13 }}>{bl.client_nom}</div>
              <div style={{ color:'#6D6D6D', fontSize:12, marginTop:4, lineHeight:1.7 }}>
                <div>Pays : Gabon</div>
              </div>
            </div>
          </div>

          {/* Tableau articles */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
            <thead>
              <tr style={{ background:'#1A9E8F' }}>
                {['N°', 'Désignation', 'Qté commandée', 'Qté livrée', 'Statut'].map((h, i) => (
                  <th key={i} style={{ padding:'9px 12px', color:'#fff', fontSize:11, fontWeight:700, textAlign: i === 0 ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(bl.lignes || []).map((l, i) => {
                const isLivre = l.statut_ligne === 'livre'
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#E8F6F5' : '#fff' }}>
                    <td style={{ padding:'8px 12px', textAlign:'center', color:'#6D6D6D', fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'8px 12px', fontSize:12, fontWeight:500 }}>{l.designation}</td>
                    <td style={{ padding:'8px 12px', fontSize:12, textAlign:'center' }}>{l.qte_commandee}</td>
                    <td style={{ padding:'8px 12px', fontSize:12, textAlign:'center', fontWeight:600 }}>{l.qte_livree}</td>
                    <td style={{ padding:'8px 12px' }}>
                      <span style={{ background: isLivre ? '#f0fdf4' : '#fff7ed', color: isLivre ? '#16a34a' : '#d97706', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>
                        {isLivre ? '✓ Livré' : '⏳ En attente'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Récap */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:24 }}>
            {[
              ['Total articles', total, '#2C2C2C'],
              ['Articles livrés', livrees, '#16a34a'],
              ['En attente', total - livrees, '#d97706'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background:'#f9fafb', borderRadius:8, padding:'12px 16px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#6D6D6D', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:700, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Remarques */}
          {bl.remarques && (
            <div style={{ background:'#f9fafb', borderRadius:6, padding:'10px 14px', fontSize:12, marginBottom:24 }}>
              <strong>Remarques : </strong>{bl.remarques}
            </div>
          )}

          {/* Signatures */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:40, marginBottom:20 }}>
            {['Signature du livreur / expéditeur', 'Signature du client (bon pour réception)'].map((label, i) => (
              <div key={i}>
                <div style={{ fontSize:11, fontWeight:600, marginBottom:50 }}>{label} :</div>
                <div style={{ borderBottom:'1px solid #ccc', paddingBottom:4, fontSize:11, color:'#6D6D6D' }}>
                  {i === 1 ? `Reçu à Libreville, le ${fmtDate(bl.date_livraison)}` : 'Nom & cachet Galerie Médicale'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height:3, background:'#1A9E8F', borderRadius:2, margin:'16px 0 10px' }} />
          <div style={{ fontSize:10, color:'#6D6D6D', textAlign:'center' }}>
            ✆ (00241) 60202900  |  ✉ acceuil@sajgroupe.com  |  🌐 www.sajgroupe.com  |  NIF : 49761L  |  RCCM : GA-LBV-01-2020-B12-00179
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BonsLivraison() {
  const { user } = useAuth()
  const [bls, setBls] = useState([])
  const [factures, setFactures] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewBL, setPreviewBL] = useState(null)
  const [form, setForm] = useState({ facture_id:'', date_livraison:today(), livreur:'', remarques:'' })
  const [lignesBL, setLignesBL] = useState([])

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const [{ data: b }, { data: f }] = await Promise.all([
      supabase.from('bons_livraison').select('*').order('created_at', { ascending:false }),
      supabase.from('factures').select('id,numero,client_nom').in('type',['facture','proforma']).order('created_at', { ascending:false }),
    ])
    setBls(b || [])
    setFactures(f || [])
    setLoading(false)
  }

  const openPreview = async (bl) => {
    const { data: lignes } = await supabase.from('bl_lignes').select('*').eq('bl_id', bl.id)
    const facture = factures.find(f => f.id === bl.facture_id)
    setPreviewBL({ ...bl, lignes: lignes || [], facture_num: facture?.numero })
  }

  const onSelectFacture = async (factureId) => {
    setForm(f => ({ ...f, facture_id:factureId }))
    if (!factureId) { setLignesBL([]); return }
    const { data:lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', parseInt(factureId))
    setLignesBL((lignes||[]).map(l => ({ ...l, qte_livree:l.quantite, statut_ligne:'attente', observation:'' })))
  }

  const toggleStatutLigne = (i) => {
    setLignesBL(prev => prev.map((l,idx) => idx===i ? { ...l, statut_ligne: l.statut_ligne==='livre' ? 'attente' : 'livre' } : l))
  }

  const handleSave = async () => {
    if (!form.facture_id) { toast.error('Sélectionnez une facture'); return }
    const facture = factures.find(f => f.id === parseInt(form.facture_id))
    const livrees = lignesBL.filter(l => l.statut_ligne==='livre').length
    const total = lignesBL.length
    const statut = livrees===total && total>0 ? 'complet' : livrees===0 ? 'attente' : 'partiel'

    const annee = new Date().getFullYear()
    // Numéro basé sur le plus grand numéro BL existant de l'année (robuste aux suppressions)
    const prochainNumero = async () => {
      const { data: existants } = await supabase
        .from('bons_livraison')
        .select('numero')
        .like('numero', `BL-%-${annee}`)
      let maxSeq = 0
      const regex = new RegExp(`^BL-(\\d+)-${annee}$`)
      for (const row of (existants || [])) {
        const m = row.numero?.match(regex)
        if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n }
      }
      return `BL-${String(maxSeq + 1).padStart(3, '0')}-${annee}`
    }

    // Insertion avec jusqu'à 5 tentatives en cas de collision de numéro (code 23505)
    let bl = null
    let derniereErreur = null
    for (let essai = 0; essai < 5; essai++) {
      const numero = await prochainNumero()
      const { data, error } = await supabase.from('bons_livraison').insert({
        numero, facture_id:parseInt(form.facture_id),
        client_nom: facture?.client_nom||'',
        date_livraison:form.date_livraison,
        livreur:form.livreur, statut, remarques:form.remarques,
        created_by:user.id,
      }).select().single()
      if (!error) { bl = data; break }
      derniereErreur = error
      if (error.code !== '23505') break
    }

    if (!bl) {
      console.error('Erreur création BL :', derniereErreur)
      toast.error('Erreur lors de la création du bon de livraison')
      return
    }

    if (lignesBL.length>0) {
      await supabase.from('bl_lignes').insert(lignesBL.map(l => ({
        bl_id:bl.id, designation:l.designation,
        qte_commandee:l.quantite, qte_livree:l.qte_livree,
        unite:'Forfait', statut_ligne:l.statut_ligne, observation:l.observation,
      })))
    }
    toast.success(`Bon de livraison ${bl.numero} créé !`)
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
              <tr><th>N° BL</th><th>Facture liée</th><th>Client</th><th>Date livraison</th><th>Livreur</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Chargement...</td></tr>
              ) : bls.length===0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Aucun bon de livraison</td></tr>
              ) : bls.map(b => {
                const st = STATUTS_BL[b.statut]||STATUTS_BL.attente
                const factNum = factures.find(f=>f.id===b.facture_id)?.numero || '—'
                return (
                  <tr key={b.id}>
                    <td className="font-mono" style={{ color:'var(--teal)', fontWeight:600 }}>{b.numero}</td>
                    <td className="font-mono" style={{ color:'var(--gray)' }}>{factNum}</td>
                    <td style={{ fontWeight:500 }}>{b.client_nom}</td>
                    <td style={{ color:'var(--gray)' }}>{fmtDate(b.date_livraison)}</td>
                    <td style={{ color:'var(--gray)' }}>{b.livreur||'—'}</td>
                    <td><span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPreview(b)}>👁 Aperçu</button>
                        <select style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)' }}
                          value={b.statut} onChange={e => updateStatut(b.id, e.target.value)}>
                          <option value="attente">En attente</option>
                          <option value="partiel">Partiel</option>
                          <option value="complet">Complet</option>
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

      {/* Modal Nouveau BL */}
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
              {lignesBL.length>0 && (
                <>
                  <div className="divider" />
                  <div className="card-title mb-4">Articles — cochez ce qui est livré</div>
                  {lignesBL.map((l,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f3f4f6' }}>
                      <div onClick={() => toggleStatutLigne(i)} style={{ width:22, height:22, borderRadius:6, flexShrink:0, cursor:'pointer', border: l.statut_ligne==='livre' ? 'none' : '2px solid var(--border)', background: l.statut_ligne==='livre' ? 'var(--success)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13 }}>
                        {l.statut_ligne==='livre' && '✓'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:500, fontSize:13 }}>{l.designation}</div>
                        <div style={{ fontSize:11, color:'var(--gray)' }}>Qté : {l.quantite}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {lignesBL.length===0 && form.facture_id && <div className="alert alert-warn">Aucun article trouvé.</div>}
              {!form.facture_id && <div className="alert alert-info">Sélectionnez une facture pour charger les articles.</div>}
              <div className="divider" />
              <div className="form-group">
                <label>Remarques / Réserves</label>
                <textarea placeholder="Observations..." value={form.remarques} onChange={e => setForm(f=>({...f,remarques:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave}>Créer le BL</button>
            </div>
          </div>
        </div>
      )}

      {previewBL && <PrintBL bl={previewBL} onClose={() => setPreviewBL(null)} />}
    </div>
  )
}
