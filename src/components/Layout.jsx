import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: 'grid', exact: true },
  { section: 'Facturation' },
  { to: '/factures', label: 'Factures', icon: 'file', roles: ['admin','comptable'] },
  { to: '/proforma', label: 'Pro Forma', icon: 'file-check', roles: ['admin','comptable'] },
  { section: 'Logistique' },
  { to: '/livraison', label: 'Bons de livraison', icon: 'truck' },
  { section: 'Catalogue' },
  { to: '/produits', label: 'Base produits', icon: 'package', roles: ['admin','comptable'] },
  { section: 'Administration' },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: 'users', roles: ['admin'] },
]

const Icon = ({ name }) => {
  const icons = {
    grid: <><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></>,
    file: <><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></>,
    'file-check': <><path d="M2 1h12v14H2z" rx="1"/><path d="M5 5h6M5 8h6"/><path d="M5 11l1.5 1.5 2.5-3"/></>,
    truck: <><path d="M1 11V5l4-4h6l4 4v6"/><path d="M1 11h14"/><circle cx="4.5" cy="13" r="1.5"/><circle cx="11.5" cy="13" r="1.5"/></>,
    package: <><path d="M8 1l7 4v6l-7 4-7-4V5z"/><path d="M8 1v14M1 5l7 4 7-4"/></>,
    users: <><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5"/><circle cx="13" cy="7" r="2"/><path d="M11 14c0-2 .9-3 2-3"/></>,
  }
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{icons[name]}</svg>
}

export default function Layout() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Déconnexion réussie')
    navigate('/login')
  }

  const initials = profile?.nom?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '.3px' }}>Galerie Médicale</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>SAJ Groupe · Libreville</div>
          {profile?.role === 'admin' && (
            <div style={{ display:'inline-block', background:'var(--teal)', color:'#fff', fontSize:9, padding:'2px 7px', borderRadius:10, marginTop:6, letterSpacing:.5, fontWeight:600 }}>ADMIN</div>
          )}
        </div>

        <nav style={{ padding: '10px 0', flex: 1 }}>
          {navItems.map((item, i) => {
            if (item.section) return (
              <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', padding: '10px 18px 3px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                {item.section}
              </div>
            )
            if (item.roles && !item.roles.includes(profile?.role)) return null
            return (
              <NavLink
                key={item.to} to={item.to} end={item.exact}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px',
                  color: isActive ? '#fff' : 'rgba(255,255,255,.55)', fontSize: 13,
                  borderLeft: isActive ? '3px solid var(--teal)' : '3px solid transparent',
                  background: isActive ? 'rgba(26,158,143,.15)' : 'transparent',
                  transition: 'all .15s', textDecoration: 'none'
                })}
              >
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--teal)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#fff', flexShrink:0 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize:12, color:'#fff', fontWeight:500, lineHeight:1.3 }}>{profile?.nom}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.4)' }}>{profile?.role}</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'none', borderRadius:7, padding:'7px 10px', color:'rgba(255,255,255,.6)', fontSize:12, cursor:'pointer', textAlign:'left', transition:'background .15s' }}
            onMouseEnter={e => e.target.style.background='rgba(255,255,255,.1)'}
            onMouseLeave={e => e.target.style.background='rgba(255,255,255,.06)'}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div style={{ fontSize:15, fontWeight:600 }} id="page-title">Galerie Médicale</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:12, color:'var(--gray)' }}>
              {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
