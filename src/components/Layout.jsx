import LOGO_BASE64 from '../lib/logo.js'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: 'grid', exact: true },
  { section: 'Facturation' },
  { to: '/factures', label: 'Factures', icon: 'file', roles: ['admin','comptable'] },
  { to: '/proforma', label: 'Pro Forma', icon: 'file-check', roles: ['admin','comptable'] },
  { to: '/caisse', label: 'Caisse', icon: 'cash', roles: ['admin'] },
  { section: 'Logistique' },
  { to: '/livraison', label: 'Bons de livraison', icon: 'truck' },
  { section: 'Catalogue' },
  { to: '/produits', label: 'Base produits', icon: 'package', roles: ['admin','comptable'] },
  { section: 'Communication' },
  { to: '/chat', label: 'Tchat', icon: 'chat', badge: 'chat' },
  { section: 'Ressources Humaines' },
  { to: '/pointage', label: 'Pointage', icon: 'clock' },
  { to: '/presences', label: 'Présences', icon: 'user-check', roles: ['admin'] },
  { section: 'Administration' },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: 'users', roles: ['admin'] },
  { to: '/parametres', label: 'Paramètres', icon: 'settings', roles: ['admin'] },
]

const Icon = ({ name }) => {
  const icons = {
    grid: <><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></>,
    file: <><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></>,
    'file-check': <><path d="M2 1h12v14H2z" rx="1"/><path d="M5 5h6M5 8h6"/><path d="M5 11l1.5 1.5 2.5-3"/></>,
    truck: <><path d="M1 11V5l4-4h6l4 4v6"/><path d="M1 11h14"/><circle cx="4.5" cy="13" r="1.5"/><circle cx="11.5" cy="13" r="1.5"/></>,
    package: <><path d="M8 1l7 4v6l-7 4-7-4V5z"/><path d="M8 1v14M1 5l7 4 7-4"/></>,
    users: <><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5"/><circle cx="13" cy="7" r="2"/><path d="M11 14c0-2 .9-3 2-3"/></>,
    settings: <><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></>,
    clock: <><circle cx="8" cy="8" r="7"/><path d="M8 4v4l2.5 2"/></>,
    cash: <><rect x="1" y="3" width="14" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.5"/></>,
    'user-check': <><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5"/><path d="M11 7l1.5 1.5L15 6"/></>,
    chat: <><path d="M14 9c0 .5-.2 1-.6 1.4l-1 .9C12 11.7 11.5 12 11 12H6l-3 2.5V4c0-.6.4-1 1-1h9c.6 0 1 .4 1 1v5z"/></>,
  }
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{icons[name]}</svg>
}

export default function Layout() {
  const { user, profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [nonLus, setNonLus] = useState(0)

  // Compter les messages non lus du chat
  useEffect(() => {
    if (!user) return

    const charger = async () => {
      // Récupérer la dernière lecture
      const { data: lecture } = await supabase
        .from('chat_lectures')
        .select('derniere_lecture')
        .eq('user_id', user.id)
        .maybeSingle()

      const derniereLecture = lecture?.derniere_lecture || '1970-01-01'

      // Compter les messages plus récents (et qui ne sont pas de l'utilisateur)
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', derniereLecture)
        .neq('user_id', user.id)

      setNonLus(count || 0)
    }

    charger()

    // S'abonner aux nouveaux messages en temps réel
    const channel = supabase
      .channel('layout-chat-badge')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          // Si ce n'est pas mon message et qu'on n'est pas sur la page chat
          if (payload.new.user_id !== user.id && !window.location.pathname.includes('/chat')) {
            setNonLus(n => n + 1)
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_lectures', filter: `user_id=eq.${user.id}` },
        () => charger()
      )
      .subscribe()

    // Reset le compteur quand on arrive sur /chat
    const handleLocation = () => {
      if (window.location.pathname.includes('/chat')) setNonLus(0)
    }
    window.addEventListener('popstate', handleLocation)
    handleLocation()

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('popstate', handleLocation)
    }
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    toast.success('Déconnexion réussie')
    navigate('/login')
  }

  const initials = profile?.nom?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {/* Logo dans la sidebar */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO_BASE64} alt="Galerie Médicale" style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 6, background: '#fff', padding: 3 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', letterSpacing: '.3px', lineHeight: 1.3 }}>Galerie Médicale</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 1 }}>SAJ Groupe · Libreville</div>
            {profile?.role === 'admin' && (
              <div style={{ display:'inline-block', background:'var(--teal)', color:'#fff', fontSize:9, padding:'1px 6px', borderRadius:8, marginTop:3, letterSpacing:.5, fontWeight:600 }}>ADMIN</div>
            )}
          </div>
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
                onClick={() => { if (item.badge === 'chat') setNonLus(0) }}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px',
                  color: isActive ? '#fff' : 'rgba(255,255,255,.55)', fontSize: 13,
                  borderLeft: isActive ? '3px solid var(--teal)' : '3px solid transparent',
                  background: isActive ? 'rgba(26,158,143,.15)' : 'transparent',
                  transition: 'all .15s', textDecoration: 'none',
                  position: 'relative'
                })}
              >
                <Icon name={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge === 'chat' && nonLus > 0 && (
                  <span style={{
                    background: '#ef4444', color: 'white',
                    fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 10,
                    minWidth: 18, textAlign: 'center'
                  }}>
                    {nonLus > 99 ? '99+' : nonLus}
                  </span>
                )}
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
          <button onClick={handleSignOut}
            style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'none', borderRadius:7, padding:'7px 10px', color:'rgba(255,255,255,.6)', fontSize:12, cursor:'pointer', textAlign:'left' }}
            onMouseEnter={e => e.target.style.background='rgba(255,255,255,.1)'}
            onMouseLeave={e => e.target.style.background='rgba(255,255,255,.06)'}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src={LOGO_BASE64} alt="GM" style={{ width:36, height:36, objectFit:'contain' }} />
            <div style={{ fontSize:15, fontWeight:600 }}>Galerie Médicale</div>
          </div>
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
