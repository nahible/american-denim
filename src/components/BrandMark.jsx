import { useState } from 'react'
import { useStorageAssets } from '../hooks/useStorageAssets.js'
import { STORAGE_BUCKETS } from '../services/storageService.js'

export function BrandMark({ className = 'nav__logo-static' }) {
  const { assets } = useStorageAssets(STORAGE_BUCKETS.brandAssets)
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = assets[0]

  if (imageUrl && !imageFailed) {
    return (
      <img
        className={`${className} brand-mark__image`}
        src={imageUrl}
        alt="americandrm"
        onError={() => setImageFailed(true)}
      />
    )
  }

  return <span className={className}>AD</span>
}
