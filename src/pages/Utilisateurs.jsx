import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { fmtDate, ROLES } from '../lib/utils'
import toast from 'react-hot-toast'

// Client séparé, sans session persistée : créer un compte ne doit pas
// déconnecter l'administrateur ni remplacer sa session par celle du nouvel utilisateur.
const signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gm-signup-tmp' } }
)

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
    if (form.password.length < 6) { toast.error('Mot de passe : 6 caractères minimum'); return }
    setSaving(true)
    const email = form.email.trim().toLowerCase()

    const { data, error } = await signupClient.auth.signUp({
      email, password: form.password,
      options: { data: { nom: form.nom.trim(), role: form.role } }
    })

    if (error) {
      toast.error(error.message.includes('registered') ? 'Cet email a déjà un compte' : error.message)
      setSaving(false); return
    }
    // Supabase renvoie un utilisateur sans identité si l'email existe déjà
    if (!data?.user || (data.user.identities && data.user.identities.length === 0)) {
      toast.error('Cet email a déjà un compte. Utilisez « Mot de passe » pour le réinitialiser.')
      setSaving(false); return
    }

    const uid = data.user.id
    // Confirme le compte immédiatement (sinon connexion refusée : "Email not confirmed")
    const { error: confErr } = await supabase.rpc('admin_confirmer_utilisateur', { p_user_id: uid })
    // Le profil est créé par le trigger ; on fixe nom / rôle / actif
    await supabase.from('profiles').update({ nom: form.nom.trim(), role: form.role, actif: true }).eq('id', uid)

    if (confErr) {
      toast.error("Compte créé mais non confirmé : exécutez la migration SQL « vendeur_comptes » dans Supabase.", { duration: 8000 })
    } else {
      toast.success(`Utilisateur ${form.nom} créé ! Il peut se connecter avec ${email}.`)
    }
    setShowModal(false)
    setForm({ nom:'', email:'', role:'comptable', password:'' })
    fetchUsers()
    setSaving(false)
  }

  const resetPassword = async (u) => {
    const pwd = window.prompt(`Nouveau mot de passe pour ${u.nom} (${u.email}) — 6 caractères minimum :`)
    if (!pwd) return
    if (pwd.length < 6) { toast.error('Mot de passe : 6 caractères minimum'); return }
    const { error } = await supabase.rpc('admin_definir_mot_de_passe', { p_user_id: u.id, p_password: pwd })
    if (error) toast.error(error.message)
    else toast.success(`Mot de passe de ${u.nom} mis à jour. Communiquez-le-lui.`)
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
                    <td style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => resetPassword(u)}>Mot de passe</button>
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
