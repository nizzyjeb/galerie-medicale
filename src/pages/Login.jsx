import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Remplissez tous les champs'); return }
    setLoading(true)
    const error = await signIn(email, password)
    if (error) {
      toast.error('Email ou mot de passe incorrect')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f3', fontFamily:'var(--font)', padding:20 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'var(--teal)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22, color:'#fff', fontWeight:700 }}>GM</div>
          <h1 style={{ fontSize:22, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Galerie Médicale</h1>
          <p style={{ color:'var(--gray)', fontSize:14 }}>SAJ Groupe · Libreville, Gabon</p>
        </div>

        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-grid" style={{ gap:14 }}>
                <div className="form-group">
                  <label>Adresse email</label>
                  <input type="email" placeholder="votre@email.com" value={email}
                    onChange={e => setEmail(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label>Mot de passe</label>
                  <input type="password" placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'10px', marginTop:4 }} disabled={loading}>
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'var(--gray)' }}>
          Accès réservé au personnel autorisé.<br/>Contactez l'administrateur pour obtenir un accès.
        </p>
      </div>
    </div>
  )
}
