import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getSupabaseAuthCallbackType } from '../utils/routing.js'
import { consumeAuthRedirect } from '../utils/authRedirect.js'
import { AuthContext } from './authContext.js'

function configurationError() {
  return new Error('Supabase authentication is not configured.')
}

function getRedirectUrl(hash = '') {
  return `${window.location.origin}${window.location.pathname}${hash}`
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    let active = true
    const authCallbackType = getSupabaseAuthCallbackType(window.location.hash)

    const finishAuthRedirect = (nextSession, event) => {
      if (!authCallbackType) {
        return
      }

      window.location.hash = nextSession
        ? event === 'PASSWORD_RECOVERY' ? '#profile' : consumeAuthRedirect()
        : '#login'
    }

    const applySession = (nextSession, event) => {
      if (!active) {
        return
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }

      if (authCallbackType && (nextSession || authCallbackType === 'error')) {
        finishAuthRedirect(nextSession, event)
      }
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      applySession(data.session ?? null)
    }

    void loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      applySession(nextSession, event)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
  console.log('Google auth runtime check:', {
    supabaseExists: Boolean(supabase),
    authExists: Boolean(supabase?.auth),
    currentUrl: window.location.href,
  })

  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getRedirectUrl() },
  })
}, [])

  const signInWithPassword = useCallback(async ({ email, password }) => {
    if (!supabase) {
      return { data: null, error: configurationError() }
    }

    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signUp = useCallback(async ({ name, email, password }) => {
    if (!supabase) {
      return { data: null, error: configurationError() }
    }

    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: getRedirectUrl('#login'),
      },
    })
  }, [])

  const sendPasswordReset = useCallback(async (email) => {
    if (!supabase) {
      return { data: null, error: configurationError() }
    }

    return supabase.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl('#login') })
  }, [])

  const updatePassword = useCallback(async (password) => {
    if (!supabase) {
      return { data: null, error: configurationError() }
    }

    return supabase.auth.updateUser({ password })
  }, [])

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), [])

  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: configurationError() }
    }

    return supabase.auth.signOut()
  }, [])

  const value = useMemo(() => ({
    session,
    user,
    loading,
    passwordRecovery,
    signInWithGoogle,
    signInWithPassword,
    signUp,
    sendPasswordReset,
    updatePassword,
    clearPasswordRecovery,
    signOut,
  }), [session, user, loading, passwordRecovery, signInWithGoogle, signInWithPassword, signUp, sendPasswordReset, updatePassword, clearPasswordRecovery, signOut])

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  )
}
