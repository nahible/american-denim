import { useEffect, useState } from 'react'
import {
  Button,
  CatalogState,
  PageHero,
  ProductCard,
  ProductDetailsSkeleton,
  SectionHeading,
} from '../components/index.js'
import { setDocumentTitle } from '../lib/documentTitle.js'
import { useProductDetails } from '../hooks/useProductDetails.js'
import { useCart } from '../hooks/useCart.js'
import {
  formatPrice,
  getStockStatus,
  getVariantStockCount,
  matchVariant,
} from '../services/productTransforms.js'

function ProductDetailsView({ product, relatedError, refresh }) {
  const [selectedColor, setSelectedColor] = useState(product.availableColors[0] ?? '')
  const [selectedSize, setSelectedSize] = useState(product.availableSizes[0] ?? '')
  const [quantity, setQuantity] = useState(1)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImageIndex, setFailedImageIndex] = useState(null)
  const [addedToCart, setAddedToCart] = useState(false)
  const { addItem } = useCart()

  const activeVariant =
    matchVariant(product.variants, { color: selectedColor, size: selectedSize }) ?? product.variants[0] ?? null
  const activePriceLabel = formatPrice(activeVariant?.price ?? null, 'USD')
  const activeStockCount = getVariantStockCount(activeVariant)
  const activeStockStatus = activeVariant ? getStockStatus(activeVariant) : product.stockStatus
  const mainImage = product.gallery[selectedImageIndex] ?? product.gallery[0] ?? null
  const canIncreaseQuantity = activeStockCount === null || quantity < activeStockCount
  const canSubmit = (activeStockCount === null ? true : activeStockCount > 0) && Number.isFinite(activeVariant?.price)

  const selectVariant = (color, size) => {
    const nextVariant = matchVariant(product.variants, { color, size }) ?? product.variants[0] ?? null
    const nextStockCount = getVariantStockCount(nextVariant)

    setSelectedColor(color)
    setSelectedSize(size)
    setQuantity((current) => nextStockCount === null ? current : Math.min(current, Math.max(1, nextStockCount)))
    setAddedToCart(false)
  }

  const handleAddToCart = (event) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    const detail = [selectedColor, selectedSize].filter(Boolean).join(' / ') || activeVariant?.name || 'Standard option'
    const added = addItem({
      productId: product.id,
      variantId: activeVariant?.id,
      name: product.name,
      detail,
      price: activeVariant.price,
      currency: activeVariant.currency || 'USD',
      stockQuantity: activeStockCount,
      quantity,
    })

    if (added) {
      setAddedToCart(true)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Product / Drop"
        title={product.name}
        description={product.description || 'Product details are being prepared from the Supabase catalog.'}
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel="See the lookbook"
        ctaSecondaryHref="#lookbook"
      />

      <section className="product-detail">
        <div className="product-detail__layout">
          <div className="product-gallery">
            <div className="product-gallery__main">
              {mainImage?.url && failedImageIndex !== selectedImageIndex ? (
                <img
                  className="product-gallery__image"
                  src={mainImage.url}
                  alt={mainImage.alt_text || product.name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setFailedImageIndex(selectedImageIndex)}
                />
              ) : (
                <div className="product-gallery__placeholder">
                  <span className="product-gallery__placeholder-label">Product image unavailable</span>
                </div>
              )}
              {product.gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    className="product-gallery__nav product-gallery__nav--previous"
                    onClick={() => setSelectedImageIndex((current) => (current - 1 + product.gallery.length) % product.gallery.length)}
                    aria-label="View previous product image"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="product-gallery__nav product-gallery__nav--next"
                    onClick={() => setSelectedImageIndex((current) => (current + 1) % product.gallery.length)}
                    aria-label="View next product image"
                  >
                    →
                  </button>
                  <span className="product-gallery__count" aria-live="polite">
                    {selectedImageIndex + 1} / {product.gallery.length}
                  </span>
                </>
              )}
            </div>

            <div className="product-gallery__thumbs" aria-label="Product images">
              {product.gallery.length > 0 ? (
                product.gallery.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`product-gallery__thumb${index === selectedImageIndex ? ' product-gallery__thumb--active' : ''}`}
                    onClick={() => setSelectedImageIndex(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-pressed={index === selectedImageIndex}
                  >
                    {image.url ? (
                      <img
                        className="product-gallery__thumb-image"
                        src={image.url}
                        alt=""
                        loading={index === selectedImageIndex ? 'eager' : 'lazy'}
                        decoding="async"
                      />
                    ) : (
                      <span className="product-gallery__thumb-placeholder" />
                    )}
                  </button>
                ))
              ) : (
                <div className="product-gallery__empty">
                  <span className="eyebrow">Gallery</span>
                  <p>No gallery images have been added yet.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="product-info">
            <span className="eyebrow">{product.label}</span>
            <h2>Purchase details</h2>
            <p className="product-info__description">
              {product.description || 'Select a color and size to review availability.'}
            </p>

            <div className="product-info__pricing">
              <span className="product-info__price">{activePriceLabel}</span>
              <span className="product-info__stock">{activeStockStatus}</span>
            </div>

            <form className="product-options" onSubmit={handleAddToCart}>
              <div className="product-options__group">
                <span className="product-options__label">Available colors</span>
                <div className="product-options__choices">
                  {product.availableColors.length > 0 ? (
                    product.availableColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`product-options__choice${selectedColor === color ? ' product-options__choice--active' : ''}`}
                        onClick={() => selectVariant(color, selectedSize)}
                        aria-pressed={selectedColor === color}
                      >
                        {color}
                      </button>
                    ))
                  ) : (
                    <span className="product-options__empty-state">No color options set yet.</span>
                  )}
                </div>
              </div>

              <div className="product-options__group">
                <span className="product-options__label">Available sizes</span>
                <div className="product-options__choices">
                  {product.availableSizes.length > 0 ? (
                    product.availableSizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`product-options__choice${selectedSize === size ? ' product-options__choice--active' : ''}`}
                        onClick={() => selectVariant(selectedColor, size)}
                        aria-pressed={selectedSize === size}
                      >
                        {size}
                      </button>
                    ))
                  ) : (
                    <span className="product-options__empty-state">No size options set yet.</span>
                  )}
                </div>
              </div>

              <div className="product-options__group">
                <span className="product-options__label">Quantity</span>
                <div className="product-quantity">
                  <button
                    type="button"
                    className="product-quantity__button"
                    onClick={() => {
                      setQuantity((current) => Math.max(1, current - 1))
                      setAddedToCart(false)
                    }}
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                  >
                    -
                  </button>
                  <span className="product-quantity__value" aria-live="polite">{quantity}</span>
                  <button
                    type="button"
                    className="product-quantity__button"
                    onClick={() => {
                      setQuantity((current) => (canIncreaseQuantity ? current + 1 : current))
                      setAddedToCart(false)
                    }}
                    aria-label="Increase quantity"
                    disabled={!canIncreaseQuantity}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="product-options__group">
                <span className="product-options__label">Stock status</span>
                <p className="product-options__stock">
                  {activeVariant ? activeStockStatus : product.stockStatus}
                  {activeStockCount !== null && activeStockCount > 0 ? ` (${activeStockCount} available)` : ''}
                </p>
              </div>

              <Button as="button" type="submit" variant="checkout" disabled={!canSubmit}>
                {addedToCart ? 'Added to Cart' : 'Add to Cart'}
              </Button>
              {addedToCart && <p className="product-options__success" role="status">Added to your cart.</p>}
            </form>
          </aside>
        </div>
      </section>

      <section className="section product-related">
        <SectionHeading
          title="Related products"
          description="A considered edit of pieces that share the same materials, mood, or drop family."
        />

        {relatedError ? (
          <CatalogState
            eyebrow="Related"
            title="Related products are unavailable."
            description="The product loaded, but the related catalog query failed."
            actionLabel="Retry"
            onAction={refresh}
          />
        ) : product.relatedProducts.length > 0 ? (
          <div className="grid">
            {product.relatedProducts.map((item) => (
              <ProductCard
                key={item.id}
                name={item.name}
                price={item.priceLabel}
                label={item.label}
                imageUrl={item.imageUrl}
                imageAlt={item.imageAlt}
                href={item.href}
              />
            ))}
          </div>
        ) : (
          <CatalogState
            eyebrow="Related"
            title="No related products yet."
            description="Related items will appear here once matching products are available in Supabase."
          />
        )}
      </section>
    </>
  )
}

function ProductDetailsRoute({ productId }) {
  const { data: product, loading, error, relatedError, refresh } = useProductDetails(productId, { relatedLimit: 4 })

  useEffect(() => {
    if (loading) {
      setDocumentTitle('americandrm | product')
      return
    }

    if (error || !product) {
      setDocumentTitle('americandrm | product')
      return
    }

    setDocumentTitle(`americandrm | ${product.name}`)
  }, [loading, error, product])

  if (loading) {
    return (
      <>
        <PageHero
          eyebrow="Product / Drop"
          title="Loading product..."
          description="Fetching product details, images, variants, and related pieces from Supabase."
          ctaLabel="Back to home"
          ctaHref="#"
          ctaSecondaryLabel="See the lookbook"
          ctaSecondaryHref="#lookbook"
        />
        <ProductDetailsSkeleton />
      </>
    )
  }

  if (error || !product) {
    return (
      <>
        <PageHero
          eyebrow="Product / Drop"
          title="Product unavailable"
          description="We could not load this product right now."
          ctaLabel="Back to home"
          ctaHref="#"
          ctaSecondaryLabel="See the lookbook"
          ctaSecondaryHref="#lookbook"
        />
        <section className="section">
          <CatalogState
            eyebrow="Catalog"
            title="We could not fetch this product."
            description="Please check the product ID or try again after Supabase is available."
            actionLabel="Retry"
            onAction={refresh}
          />
        </section>
      </>
    )
  }

  return <ProductDetailsView key={product.id} product={product} relatedError={relatedError} refresh={refresh} />
}

export function ProductDetailsPage({ productId }) {
  if (!productId) {
    return (
      <section className="section">
        <CatalogState
          eyebrow="Product"
          title="This product page is unavailable."
          description="The route needs a product ID to load details from Supabase."
          actionLabel="Back to home"
          onAction={() => {
            window.location.hash = '#'
          }}
        />
      </section>
    )
  }

  return <ProductDetailsRoute productId={productId} />
}
