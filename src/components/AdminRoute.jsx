import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { rememberAuthRedirect } from '../utils/authRedirect.js'
import { adminAccessState } from '../utils/adminValidation.js'

export function AdminRoute({ children }) {
  const { user, loading, isAdmin, roleLoading, roleError } = useAuth()
  const access = adminAccessState({ authLoading: loading, roleLoading, user, isAdmin })

  useEffect(() => {
    if (!loading && !user) {
      rememberAuthRedirect(window.location.hash || '#admin')
      window.location.hash = '#login'
    }
  }, [loading, user])

  if (access === 'loading') {
    return <section className="section admin-state" aria-busy="true"><span className="eyebrow">Authorization</span><h1>Checking access…</h1></section>
  }
  if (access === 'unauthenticated') return <section className="section admin-state"><h1>Redirecting to sign in…</h1></section>
  if (access === 'unauthorized') {
    return (
      <section className="section admin-state">
        <span className="eyebrow">403 · Restricted</span>
        <h1>Administrator access required.</h1>
        <p>{roleError ? 'Your role could not be verified.' : 'This account does not have permission to open the admin panel.'}</p>
        <a className="checkout__button" href="#shop">Back to storefront</a>
      </section>
    )
  }
  return children
}
