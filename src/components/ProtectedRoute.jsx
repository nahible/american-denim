import { useAuth } from '../hooks/useAuth.js'

export function ProtectedRoute({ children, fallback = null, loadingFallback = null }) {
  const { user, loading } = useAuth()

  if (loading) {
    return loadingFallback
  }

  if (!user) {
    return fallback
  }

  return children
}
