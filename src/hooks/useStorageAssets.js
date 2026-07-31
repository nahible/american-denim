import { useEffect, useState } from 'react'
import { listPublicStorageUrls } from '../services/storageService.js'

export function useStorageAssets(bucket) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    const loadAssets = async () => {
      setLoading(true)
      const result = await listPublicStorageUrls(bucket)

      if (!active) {
        return
      }

      setAssets(result.data ?? [])
      setError(result.error)
      setLoading(false)
    }

    void loadAssets()

    return () => {
      active = false
    }
  }, [bucket])

  return { assets, loading, error }
}
