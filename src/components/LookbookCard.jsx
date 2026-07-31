import { useState } from 'react'

export function LookbookCard({ title, location, note, imageUrl }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <article className="card card--shoot">
      <div className="card__photo">
        {imageUrl && !imageFailed && (
          <img
            className="card__image"
            src={imageUrl}
            alt={`${title} lookbook`}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
        <span className="card__photo-label">{note}</span>
        <div className="card__stamp">
          <span>shoot</span>
          <span>{location}</span>
        </div>
      </div>
      <div className="card__meta">
        <div>
          <span className="card__name">{title}</span>
          <span className="card__note">{location}</span>
        </div>
        <span className="card__price">{note}</span>
      </div>
    </article>
  )
}
