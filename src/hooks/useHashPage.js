import { useEffect, useState } from 'react'
import { pageTitles } from '../constants/index.js'
import { setDocumentTitle } from '../lib/documentTitle.js'
import { getRouteFromHash } from '../utils/index.js'

export function useHashPage() {
  const [route, setRoute] = useState(() => {
    if (typeof window === 'undefined') {
      return { page: 'home', productId: null }
    }

    return getRouteFromHash(window.location.hash)
  })

  useEffect(() => {
    const syncPage = () => {
      setRoute(getRouteFromHash(window.location.hash))
      window.scrollTo(0, 0)
    }

    window.addEventListener('hashchange', syncPage)
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  useEffect(() => {
    setDocumentTitle(pageTitles[route.page])
  }, [route.page])

  return route
}
