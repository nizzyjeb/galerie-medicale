import React, { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (uid) => {
    try {
      // Désactiver le cache Supabase pour forcer une vraie requête
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nom, email, role, actif')
        .eq('id', uid)
        .maybeSingle()

      if (error) {
        console.error('fetchProfile error:', error)
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (e) {
      console.error('fetchProfile exception:', e)
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
      else {
        setProfile(null)
        setLoading(false)
      }
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
