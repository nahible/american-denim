import { useEffect, useState } from 'react'
import { fetchFeaturedProducts } from '../services/catalogService.js'

export function useFeaturedProducts({ limit = 4 } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let active = true

    const loadProducts = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchFeaturedProducts({ limit })

        if (!active) {
          return
        }

        if (result.error) {
          setProducts([])
          setError(result.error)
          setLoading(false)
          return
        }

        setProducts(result.data ?? [])
        setLoading(false)
      } catch (loadError) {
        if (!active) {
          return
        }

        setProducts([])
        setError(loadError)
        setLoading(false)
      }
    }

    loadProducts()

    return () => {
      active = false
    }
  }, [limit, retryToken])

  const refresh = () => {
    setRetryToken((current) => current + 1)
  }

  return { products, loading, error, refresh }
}
