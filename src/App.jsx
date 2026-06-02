import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Factures from './pages/Factures'
import ProForma from './pages/ProForma'
import BonsLivraison from './pages/BonsLivraison'
import Produits from './pages/Produits'
import Utilisateurs from './pages/Utilisateurs'
import Parametres from './pages/Parametres'
import Pointage from './pages/Pointage'
import Caisse from './pages/Caisse'
import Presences from './pages/Presences'
import Chat from './pages/Chat'

function ProtectedRoute({ children, adminOnly = false, comptableOnly = false }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--gray)' }}>Chargement...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  if (comptableOnly && !['admin','comptable'].includes(profile?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--gray)',fontFamily:'var(--font)' }}>Chargement...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="factures" element={<ProtectedRoute comptableOnly><Factures /></ProtectedRoute>} />
        <Route path="proforma" element={<ProtectedRoute comptableOnly><ProForma /></ProtectedRoute>} />
        <Route path="livraison" element={<BonsLivraison />} />
        <Route path="pointage" element={<Pointage />} />
        <Route path="caisse" element={<ProtectedRoute adminOnly><Caisse /></ProtectedRoute>} />
        <Route path="presences" element={<ProtectedRoute adminOnly><Presences /></ProtectedRoute>} />
        <Route path="chat" element={<Chat />} />
        <Route path="produits" element={<ProtectedRoute comptableOnly><Produits /></ProtectedRoute>} />
        <Route path="utilisateurs" element={<ProtectedRoute adminOnly><Utilisateurs /></ProtectedRoute>} />
        <Route path="parametres" element={<ProtectedRoute adminOnly><Parametres /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
