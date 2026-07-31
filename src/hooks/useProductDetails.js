import { useEffect, useState } from 'react'
import { fetchProductDetails } from '../services/productDetailsService.js'

export function useProductDetails(productId, { relatedLimit = 4 } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(productId))
  const [error, setError] = useState(null)
  const [relatedError, setRelatedError] = useState(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!productId) {
      return undefined
    }

    let active = true

    const loadProduct = async () => {
      setLoading(true)
      setError(null)
      setRelatedError(null)

      try {
        const result = await fetchProductDetails(productId, { relatedLimit })

        if (!active) {
          return
        }

        if (result.error) {
          setData(null)
          setError(result.error)
          setRelatedError(result.relatedError ?? null)
          setLoading(false)
          return
        }

        setData(result.data)
        setError(null)
        setRelatedError(result.relatedError ?? null)
        setLoading(false)
      } catch (loadError) {
        if (!active) {
          return
        }

        setData(null)
        setError(loadError)
        setRelatedError(null)
        setLoading(false)
      }
    }

    loadProduct()

    return () => {
      active = false
    }
  }, [productId, relatedLimit, retryToken])

  const refresh = () => {
    setRetryToken((current) => current + 1)
  }

  return { data, loading, error, relatedError, refresh }
}
