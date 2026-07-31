import { useDeferredValue, useMemo, useState } from 'react'
import { brandStory, marqueeItems } from '../constants/index.js'
import { Button, CatalogState, ProductCard, ProductCardSkeleton, SectionHeading } from '../components/index.js'
import { useFeaturedProducts } from '../hooks/useFeaturedProducts.js'

export function HomePage({ catalogOnly = false }) {
  const { products, loading, error, refresh } = useFeaturedProducts({ limit: catalogOnly ? 24 : 4 })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [minimumPrice, setMinimumPrice] = useState('')
  const [maximumPrice, setMaximumPrice] = useState('')
  const [sort, setSort] = useState('featured')
  const deferredSearch = useDeferredValue(search)
  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const minimum = Number(minimumPrice)
  const maximum = Number(maximumPrice)
  const hasMinimum = minimumPrice !== '' && Number.isFinite(minimum)
  const hasMaximum = maximumPrice !== '' && Number.isFinite(maximum)
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [products],
  )
  const filteredProducts = useMemo(
    () => products
      .filter((product) => {
      const price = typeof product.price === 'number' ? product.price : null
      const searchableText = [product.name, product.label, product.category].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch)
      const matchesCategory = category === 'all' || product.category === category
      const matchesMinimum = !hasMinimum || (price !== null && price >= minimum)
      const matchesMaximum = !hasMaximum || (price !== null && price <= maximum)

      return matchesSearch && matchesCategory && matchesMinimum && matchesMaximum
      })
      .sort((left, right) => {
      const leftCreatedAt = left.createdAt ?? ''
      const rightCreatedAt = right.createdAt ?? ''
      const leftPrice = typeof left.price === 'number' ? left.price : Number.POSITIVE_INFINITY
      const rightPrice = typeof right.price === 'number' ? right.price : Number.POSITIVE_INFINITY

      if (sort === 'price-low') {
        return leftPrice - rightPrice
      }

      if (sort === 'price-high') {
        return rightPrice - leftPrice
      }

      if (sort === 'newest') {
        return rightCreatedAt.localeCompare(leftCreatedAt)
      }

      if (left.featured !== right.featured) {
        return Number(right.featured) - Number(left.featured)
      }

      return rightCreatedAt.localeCompare(leftCreatedAt)
      }),
    [products, normalizedSearch, category, hasMinimum, minimum, hasMaximum, maximum, sort],
  )
  const hasActiveFilters = Boolean(search || category !== 'all' || minimumPrice || maximumPrice || sort !== 'featured')

  const clearFilters = () => {
    setSearch('')
    setCategory('all')
    setMinimumPrice('')
    setMaximumPrice('')
    setSort('featured')
  }

  return (
    <>
      {!catalogOnly && <>
        <section className="hero" id="top">
        <div className="hero__photo" aria-hidden="true" />
        <div className="hero__content">
          <span className="hero__tag">* Story / Drop No. 04 - July</span>
          <h1>Anything &amp; Everything</h1>
          <p>
            Elevated basics, sun-faded and broken in before you ever wear them. The homepage keeps the fresh drops up
            front, with just enough story to know why the line exists.
          </p>
          <Button as="a" href="#shop">
            Shop the drop
          </Button>
        </div>
        </section>

        <div className="marquee" aria-label="Brand values">
          <div className="marquee__track">
            {marqueeItems.concat(marqueeItems).map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>
      </>}

      <section className="section" id="drops">
        <SectionHeading
          title="New Drops"
          description="Search the latest pieces, then narrow the drop by category, price, or sort order."
        />

        <div className="catalog-controls" aria-label="Product discovery controls">
          <label className="catalog-controls__search">
            Search products
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              id="catalog-search"
              type="search"
              placeholder="Search the collection"
              disabled={loading}
              aria-controls="product-grid"
            />
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={loading} aria-controls="product-grid">
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Minimum price
            <input value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} type="number" min="0" inputMode="decimal" placeholder="$0" disabled={loading} aria-controls="product-grid" />
          </label>
          <label>
            Maximum price
            <input value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} type="number" min="0" inputMode="decimal" placeholder="No limit" disabled={loading} aria-controls="product-grid" />
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)} disabled={loading} aria-controls="product-grid">
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </label>
        </div>

        {!loading && !error && (
          <div className="catalog-results-row">
            <p className="catalog-results" aria-live="polite">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'piece' : 'pieces'} found
            </p>
            {hasActiveFilters && (
              <button type="button" className="text-link catalog-controls__clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && !error && hasMinimum && hasMaximum && minimum > maximum && (
          <p className="cart__sync-error" role="alert">Minimum price must be lower than maximum price.</p>
        )}

        <div className="grid" id="product-grid" aria-busy={loading} aria-live="polite">
          {loading &&
            Array.from({ length: catalogOnly ? 8 : 4 }).map((_, index) => <ProductCardSkeleton key={`drop-skeleton-${index}`} />)}

          {!loading && error && (
            <CatalogState
              eyebrow="Catalog"
              title="Drops are unavailable right now."
              description="We couldn't load the latest products. Please check the Supabase connection and try again."
              actionLabel="Retry"
              onAction={refresh}
            />
          )}

          {!loading && !error && products.length === 0 && (
            <CatalogState
              eyebrow="Catalog"
              title="No drops are live yet."
              description="Products will appear here once they're published in Supabase."
            />
          )}

          {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
            <CatalogState
              eyebrow="Discovery"
              title="No pieces match those filters."
              description="Try another search, price range, or category."
              actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
              onAction={hasActiveFilters ? clearFilters : undefined}
            />
          )}

          {!loading &&
            !error &&
            filteredProducts.map((item) => (
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
      </section>

      {!catalogOnly && <section className="home-story">
        <div className="home-story__copy">
          <span className="eyebrow">{brandStory.eyebrow}</span>
          <h2>{brandStory.title}</h2>
          {brandStory.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <a className="text-link" href="#story">
            Read the full story
          </a>
        </div>
        <div className="home-story__photo" aria-hidden="true" />
      </section>}
    </>
  )
}
