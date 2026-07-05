import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

const vide = {
  nom: '', contact: '', adresse: '', ville: 'Libreville', pays: 'Gabon',
  telephone: '', email: '', nif: '', notes: '', actif: true,
}

export default function Fournisseurs() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vide)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [recherche, setRecherche] = useState('')

  const charger = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('fournisseurs')
      .select('*')
      .order('nom', { ascending: true })
    if (error) toast.error('Erreur de chargement')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const ouvrirCreation = () => { setForm(vide); setEditId(null); setModal(true) }
  const ouvrirEdition = (f) => {
    setForm({
      nom: f.nom || '', contact: f.contact || '', adresse: f.adresse || '',
      ville: f.ville || 'Libreville', pays: f.pays || 'Gabon',
      telephone: f.telephone || '', email: f.email || '', nif: f.nif || '',
      notes: f.notes || '', actif: f.actif !== false,
    })
    setEditId(f.id)
    setModal(true)
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const enregistrer = async () => {
    if (!form.nom.trim()) { toast.error('Le nom du fournisseur est requis'); return }
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    let error
    if (editId) {
      ({ error } = await supabase.from('fournisseurs').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('fournisseurs').insert(payload))
    }
    setSaving(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success(editId ? 'Fournisseur modifié' : 'Fournisseur créé')
    setModal(false)
    charger()
  }

  const supprimer = async (f) => {
    if (!window.confirm(`Supprimer le fournisseur « ${f.nom} » ?`)) return
    const { error } = await supabase.from('fournisseurs').delete().eq('id', f.id)
    if (error) { toast.error('Suppression impossible'); return }
    toast.success('Fournisseur supprimé')
    charger()
  }

  const filtres = items.filter(f => {
    const t = recherche.toLowerCase()
    return !t || (f.nom || '').toLowerCase().includes(t) ||
      (f.ville || '').toLowerCase().includes(t) ||
      (f.contact || '').toLowerCase().includes(t)
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Fournisseurs</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>
            {items.length} fournisseur{items.length > 1 ? 's' : ''} enregistré{items.length > 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={ouvrirCreation}>+ Nouveau fournisseur</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Rechercher un fournisseur…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{ width: '100%', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
        ) : filtres.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Aucun fournisseur.</div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                  <th style={{ padding: 10 }}>Nom</th>
                  <th style={{ padding: 10 }}>Contact</th>
                  <th style={{ padding: 10 }}>Ville</th>
                  <th style={{ padding: 10 }}>Téléphone</th>
                  <th style={{ padding: 10 }}>Statut</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{f.nom}</td>
                    <td style={{ padding: 10 }}>{f.contact || '—'}</td>
                    <td style={{ padding: 10 }}>{f.ville || '—'}</td>
                    <td style={{ padding: 10 }}>{f.telephone || '—'}</td>
                    <td style={{ padding: 10 }}>
                      <span className="badge" style={{ background: f.actif !== false ? 'var(--teal)' : 'var(--gray)', color: '#fff' }}>
                        {f.actif !== false ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn" onClick={() => ouvrirEdition(f)} style={{ marginRight: 6 }}>Modifier</button>
                      {isAdmin && (
                        <button className="btn" onClick={() => supprimer(f)} style={{ color: 'var(--danger)' }}>Supprimer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="card-title">{editId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</div>
              <button className="btn" onClick={() => setModal(false)}>✕</button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <Champ label="Nom du fournisseur *">
                <input className="input" value={form.nom} onChange={e => set('nom', e.target.value)} style={inputStyle} />
              </Champ>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Champ label="Personne de contact">
                  <input className="input" value={form.contact} onChange={e => set('contact', e.target.value)} style={inputStyle} />
                </Champ>
                <Champ label="Téléphone">
                  <input className="input" value={form.telephone} onChange={e => set('telephone', e.target.value)} style={inputStyle} />
                </Champ>
              </div>
              <Champ label="Adresse">
                <input className="input" value={form.adresse} onChange={e => set('adresse', e.target.value)} style={inputStyle} />
              </Champ>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Champ label="Ville">
                  <input className="input" value={form.ville} onChange={e => set('ville', e.target.value)} style={inputStyle} />
                </Champ>
                <Champ label="Pays">
                  <input className="input" value={form.pays} onChange={e => set('pays', e.target.value)} style={inputStyle} />
                </Champ>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Champ label="Email">
                  <input className="input" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
                </Champ>
                <Champ label="NIF">
                  <input className="input" value={form.nif} onChange={e => set('nif', e.target.value)} style={inputStyle} />
                </Champ>
              </div>
              <Champ label="Notes">
                <textarea className="input" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </Champ>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={form.actif} onChange={e => set('actif', e.target.checked)} />
                Fournisseur actif
              </label>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { width: '100%', padding: 9, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }

function Champ({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--gray)', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}
