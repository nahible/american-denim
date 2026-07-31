export function ProductDetailsSkeleton() {
  return (
    <section className="product-detail" aria-hidden="true">
      <div className="product-detail__layout">
        <div className="product-gallery product-detail__skeleton-panel">
          <div className="product-gallery__main product-detail__skeleton-media" />
          <div className="product-gallery__thumbs">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`thumb-skel-${index}`} className="product-gallery__thumb product-detail__skeleton-media" />
            ))}
          </div>
        </div>

        <div className="product-info product-detail__skeleton-panel">
          <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--eyebrow" />
          <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--title" />
          <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--price" />
          <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--copy" />
          <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--copy" />
          <div className="product-options">
            <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--label" />
            <div className="product-options__choices">
              {Array.from({ length: 3 }).map((_, index) => (
                <span key={`choice-skel-${index}`} className="card__skeleton product-detail__skeleton-chip" />
              ))}
            </div>
          </div>
          <div className="product-options">
            <span className="card__skeleton product-detail__skeleton-line product-detail__skeleton-line--label" />
            <div className="product-quantity">
              <span className="card__skeleton product-detail__skeleton-quantity" />
            </div>
          </div>
          <span className="card__skeleton product-detail__skeleton-button" />
        </div>
      </div>
    </section>
  )
}
