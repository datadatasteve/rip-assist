import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext({ session: null, user: null, loading: true, needsPasswordReset: false, clearPasswordReset: () => {} })

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s)
      if (evt === 'PASSWORD_RECOVERY') setNeedsPasswordReset(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading, needsPasswordReset, clearPasswordReset: () => setNeedsPasswordReset(false) }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
