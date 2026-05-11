import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import toast from 'react-hot-toast'

const CATEGORIES = ['CONSOMMABLE', 'EQUIPEMENT', 'SERVICE', 'AUTRE']
const UNITES = ['PIECE', 'Forfait', 'Séance', 'Jour', 'Acte', 'Examen', 'Boîte', 'Flacon']

export default function Produits() {
  const [produits, setProduits] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editProd, setEditProd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ reference:'', designation:'', categorie:'CONSOMMABLE', unite:'PIECE', prix_ht:'', exonere_tva:false })

  useEffect(() => { fetchProduits() }, [])

  const fetchProduits = async () => {
    const { data } = await supabase.from('produits').select('*').eq('actif', true).order('categorie').order('designation')
    setProduits(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setEditProd(null)
    setForm({ reference:'', designation:'', categorie:'CONSOMMABLE', unite:'PIECE', prix_ht:'', exonere_tva:false })
    setShowModal(true)
  }

  const openEdit = (p) => {
    setEditProd(p)
    setForm({ reference:p.reference, designation:p.designation, categorie:p.categorie, unite:p.unite, prix_ht:p.prix_ht, exonere_tva: !!p.exonere_tva })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.reference.trim() || !form.designation.trim() || !form.prix_ht) { toast.error('Remplissez tous les champs'); return }
    setSaving(true)
    const data = { ...form, prix_ht: parseFloat(form.prix_ht), exonere_tva: !!form.exonere_tva }
    if (editProd) {
      await supabase.from('produits').update(data).eq('id', editProd.id)
      toast.success('Produit mis à jour')
    } else {
      await supabase.from('produits').insert(data)
      toast.success('Produit ajouté')
    }
    setSaving(false)
    setShowModal(false)
    fetchProduits()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Désactiver ce produit ?')) return
    await supabase.from('produits').update({ actif: false }).eq('id', id)
    toast.success('Produit désactivé')
    fetchProduits()
  }

  const filtered = produits.filter(p => {
    const matchSearch = !search || p.designation.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'all' || p.categorie === catFilter
    return matchSearch && matchCat
  })

  const prix = parseFloat(form.prix_ht) || 0

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:18, fontWeight:600 }}>Base produits <span style={{ color:'var(--gray)', fontWeight:400, fontSize:14 }}>({produits.length} références)</span></h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Ajouter produit</button>
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <input style={{ maxWidth:280 }} placeholder="Rechercher par nom ou référence..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ maxWidth:180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Réf.</th><th>Désignation</th><th>Catégorie</th><th>Unité</th><th style={{textAlign:'right'}}>Prix HT</th><th style={{textAlign:'right'}}>TVA 18%</th><th style={{textAlign:'right'}}>CSS 1%</th><th style={{textAlign:'right'}}>TTC</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Aucun produit trouvé</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-mono" style={{ color:'var(--gray)', fontWeight:600, fontSize:11 }}>{p.reference}</td>
                  <td style={{ fontWeight:500 }}>{p.designation}</td>
                  <td>
                    <span className="badge" style={{ background: p.categorie==='CONSOMMABLE' ? 'var(--teal-light)' : 'var(--lgray)', color: p.categorie==='CONSOMMABLE' ? 'var(--teal)' : 'var(--gray)' }}>
                      {p.categorie}
                    </span>
                    {p.exonere_tva && (
                      <span className="badge" style={{ background:'#fef3c7', color:'#92400e', marginLeft:6 }}>
                        Exonéré TVA
                      </span>
                    )}
                  </td>
                  <td style={{ color:'var(--gray)' }}>{p.unite}</td>
                  <td className="font-mono" style={{ textAlign:'right' }}>{fmt(p.prix_ht)}</td>
                  <td className="font-mono" style={{ textAlign:'right', color:'var(--gray)' }}>{fmt(p.tva)}</td>
                  <td className="font-mono" style={{ textAlign:'right', color:'var(--gray)' }}>{fmt(p.css)}</td>
                  <td className="font-mono" style={{ textAlign:'right', fontWeight:600, color:'var(--teal)' }}>{fmt(p.prix_ttc)}</td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Modifier</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Suppr.</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:480 }}>
            <div className="modal-header">
              <div className="card-title">{editProd ? 'Modifier le produit' : 'Ajouter un produit'}</div>
              <button onClick={() => setShowModal(false)} style={{ background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--gray)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label>Référence *</label>
                    <input placeholder="GM-001" value={form.reference} onChange={e => setForm(f=>({...f,reference:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Catégorie</label>
                    <select value={form.categorie} onChange={e => setForm(f=>({...f,categorie:e.target.value}))}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Désignation *</label>
                  <input placeholder="Nom du produit ou de la prestation" value={form.designation} onChange={e => setForm(f=>({...f,designation:e.target.value}))} />
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label>Unité</label>
                    <select value={form.unite} onChange={e => setForm(f=>({...f,unite:e.target.value}))}>
                      {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Prix HT (FCFA) *</label>
                    <input type="number" min="0" placeholder="0" value={form.prix_ht} onChange={e => setForm(f=>({...f,prix_ht:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group" style={{ background: form.exonere_tva ? '#fef3c7' : 'var(--lgray)', borderRadius:8, padding:'10px 14px', border: form.exonere_tva ? '1px solid #fcd34d' : '1px solid transparent' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:0 }}>
                    <input
                      type="checkbox"
                      checked={!!form.exonere_tva}
                      onChange={e => setForm(f => ({ ...f, exonere_tva: e.target.checked }))}
                      style={{ width:16, height:16, cursor:'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>Exonéré de TVA</div>
                      <div style={{ fontSize:11, color:'var(--gray)', marginTop:2 }}>
                        Aucune TVA (18%) ne sera appliquée sur ce produit. La CSS (1%) reste due.
                      </div>
                    </div>
                  </label>
                </div>
                {prix > 0 && (
                  <div style={{ background:'var(--lgray)', borderRadius:8, padding:14 }}>
                    <div style={{ fontSize:11, color:'var(--gray)', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>
                      Aperçu des prix {form.exonere_tva && <span style={{ color:'#92400e' }}>(exonéré)</span>}
                    </div>
                    {(form.exonere_tva
                      ? [['HT', prix], ['TVA', 0], ['CSS 1%', prix*.01], ['TTC', prix*1.01]]
                      : [['HT', prix], ['TVA 18%', prix*.18], ['CSS 1%', prix*.01], ['TTC', prix*1.19]]
                    ).map(([l,v]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                        <span style={{ color:'var(--gray)' }}>{l}</span>
                        <span className="font-mono" style={{ fontWeight: l==='TTC' ? 600 : 400, color: l==='TTC' ? 'var(--teal)' : 'var(--text)' }}>{fmt(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
