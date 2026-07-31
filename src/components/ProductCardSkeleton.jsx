export function ProductCardSkeleton() {
  return (
    <article className="card card--drop card--skeleton" aria-hidden="true">
      <div className="card__photo card__photo--skeleton">
        <span className="sr-only">Loading product</span>
      </div>
      <div className="card__meta">
        <span className="card__skeleton card__skeleton--name" />
        <span className="card__skeleton card__skeleton--price" />
      </div>
    </article>
  )
}
