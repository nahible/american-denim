import { memo, useState } from 'react'

export const ProductCard = memo(function ProductCard({ name, price, label, imageUrl, imageAlt, href, className = '' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const Component = href ? 'a' : 'article'
  const linkProps = href ? { href, 'aria-label': `${name} product details` } : {}

  return (
    <Component className={`card card--drop${className ? ` ${className}` : ''}`} {...linkProps}>
      <div className="card__photo">
        {imageUrl && !imageFailed ? (
          <img
            className="card__image"
            src={imageUrl}
            alt={imageAlt || name}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : <span className="card__image-fallback" aria-hidden="true" />}
        <span className="card__photo-label">{label}</span>
      </div>
      <div className="card__meta">
        <span className="card__name">{name}</span>
        <span className="card__price">{price}</span>
      </div>
    </Component>
  )
})
