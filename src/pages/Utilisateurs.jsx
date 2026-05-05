import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, ROLES } from '../lib/utils'
import toast from 'react-hot-toast'

export default function Utilisateurs() {
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nom:'', email:'', role:'comptable', password:'' })

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  const handleInvite = async () => {
    if (!form.nom || !form.email || !form.password) { toast.error('Remplissez tous les champs'); return }
    setSaving(true)
    const { error } = await supabase.auth.admin
      ? supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { nom: form.nom, role: form.role } } })
      : { error: null }

    if (error) {
      toast.error(error.message)
    } else {
      await supabase.from('profiles').upsert({ email: form.email, nom: form.nom, role: form.role })
      toast.success(`Utilisateur ${form.nom} créé ! Il peut se connecter avec son email et mot de passe.`)
      setShowModal(false)
      setForm({ nom:'', email:'', role:'comptable', password:'' })
      fetchUsers()
    }
    setSaving(false)
  }

  const toggleActif = async (id, actif) => {
    await supabase.from('profiles').update({ actif: !actif }).eq('id', id)
    setUsers(prev => prev.map(u => u.id===id ? {...u, actif:!actif} : u))
    toast.success(actif ? 'Accès suspendu' : 'Accès réactivé')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:18, fontWeight:600 }}>Utilisateurs</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Ajouter utilisateur</button>
      </div>

      <div className="alert alert-info mb-4">
        Créez les comptes de votre équipe ici. Chaque utilisateur se connecte avec son email et mot de passe sur l'application.
      </div>

      <div className="card mb-4">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Créé le</th><th>Statut</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>Chargement...</td></tr>
              ) : users.map(u => {
                const role = ROLES[u.role] || { label: u.role, color:'var(--gray)' }
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight:500 }}>{u.nom}</td>
                    <td style={{ color:'var(--gray)', fontSize:13 }}>{u.email}</td>
                    <td><span className="badge" style={{ background:`${role.color}18`, color:role.color }}>{role.label}</span></td>
                    <td style={{ color:'var(--gray)' }}>{fmtDate(u.created_at)}</td>
                    <td>
                      <span className="badge" style={{ background: u.actif ? '#f0fdf4':'#fef2f2', color: u.actif ? '#166534':'#991b1b' }}>
                        {u.actif ? 'Actif' : 'Suspendu'}
                      </span>
                    </td>
                    <td>
                      {u.role !== 'admin' && (
                        <button className={`btn btn-sm ${u.actif ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => toggleActif(u.id, u.actif)}>
                          {u.actif ? 'Suspendre' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Droits par rôle</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-3" style={{ gap:16 }}>
            {Object.entries(ROLES).map(([key, { label, color }]) => (
              <div key={key} style={{ border:'1px solid var(--border)', borderRadius:10, padding:14 }}>
                <div style={{ fontWeight:600, color, marginBottom:10, fontSize:13 }}>{label}</div>
                <div style={{ fontSize:12, color:'var(--gray)', lineHeight:1.9 }}>
                  {key === 'admin' && <><div>✓ Accès complet à tout</div><div>✓ Gestion des utilisateurs</div><div>✓ Paramètres du système</div><div>✓ Tableau de bord complet</div></>}
                  {key === 'comptable' && <><div>✓ Créer factures & pro formas</div><div>✓ Gérer la base produits</div><div>✓ Voir le tableau de bord</div><div>✗ Gestion des utilisateurs</div></>}
                  {key === 'livreur' && <><div>✓ Bons de livraison</div><div>✓ Valider les livraisons</div><div>✓ Tableau de bord (limité)</div><div>✗ Factures & finances</div></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:460 }}>
            <div className="modal-header">
              <div className="card-title">Créer un utilisateur</div>
              <button onClick={() => setShowModal(false)} style={{ background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--gray)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nom complet *</label>
                  <input placeholder="Marie KOUMBA" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" placeholder="m.koumba@galeriemedicale.ga" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Mot de passe provisoire *</label>
                  <input type="password" placeholder="8 caractères minimum" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Rôle *</label>
                  <select value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    <option value="comptable">Comptable / Secrétaire</option>
                    <option value="livreur">Livreur / Commercial</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <div className="alert alert-info">
                  L'utilisateur pourra se connecter immédiatement avec cet email et ce mot de passe. Pensez à lui communiquer ses identifiants.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleInvite} disabled={saving}>
                {saving ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
