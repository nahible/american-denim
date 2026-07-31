import { useEffect, useState } from 'react'
import { fetchUserProfile } from '../services/profileService.js'

export function useUserProfile(user) {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({
    userId: null,
    loading: true,
    profile: null,
    orders: [],
    profileError: null,
    ordersError: null,
  })

  useEffect(() => {
    if (!user?.id) {
      return undefined
    }

    let active = true

    const loadProfile = async () => {
      const result = await fetchUserProfile(user)
      if (active) {
        setState({ userId: user.id, loading: false, ...result })
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [user, requestVersion])

  return {
    ...state,
    loading: state.userId !== user?.id || state.loading,
    refresh: () => setRequestVersion((current) => current + 1),
  }
}
