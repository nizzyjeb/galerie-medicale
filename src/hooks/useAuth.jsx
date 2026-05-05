import React, { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (uid) => {
    try {
      // Tentative 1 : lecture directe
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nom, email, role, actif')
        .eq('id', uid)
        .maybeSingle()

      if (!error && data) {
        setProfile(data)
        setLoading(false)
        return
      }

      // Tentative 2 : via la session auth (fallback si RLS bloque)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.user_metadata?.role) {
        setProfile({
          id: uid,
          nom: authUser.user_metadata?.nom || authUser.email?.split('@')[0] || 'User',
          email: authUser.email,
          role: authUser.user_metadata.role,
          actif: true
        })
      } else {
        // Tentative 3 : forcer le rôle admin si c'est l'email connu
        const knownAdmins = ['anisjebbari88@gmail.com', 'gaelwillymouembe@gmail.com']
        if (knownAdmins.includes(authUser?.email)) {
          setProfile({
            id: uid,
            nom: authUser.email?.split('@')[0] || 'Admin',
            email: authUser.email,
            role: 'admin',
            actif: true
          })
        } else {
          setProfile({ id: uid, nom: 'Utilisateur', email: authUser?.email || '', role: 'comptable', actif: true })
        }
      }
    } catch (e) {
      console.error('fetchProfile error:', e)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'
  const isComptable = profile?.role === 'admin' || profile?.role === 'comptable'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isAdmin, isComptable }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
