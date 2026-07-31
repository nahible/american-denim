import type { ISODateTime } from './shared.js'

export interface CatalogProductImage {
  id: string
  product_id: string
  url?: string | null
  alt_text?: string | null
  sort_order?: number | null
  created_at?: ISODateTime | null
}

export interface CatalogProductVariant {
  id: string
  product_id: string
  name?: string | null
  price?: number | null
  currency?: string | null
  compare_at_price?: number | null
  created_at?: ISODateTime | null
}

export interface CatalogProductCard {
  id: string
  name: string
  slug?: string | null
  label: string
  category: string
  featured: boolean
  createdAt?: ISODateTime | null
  price?: number | null
  currency?: string | null
  priceLabel: string
  imageUrl?: string | null
  imageAlt?: string | null
  href: string
}

export interface CatalogProductGalleryImage {
  id: string
  product_id: string
  url?: string | null
  alt_text?: string | null
  sort_order?: number | null
  created_at?: ISODateTime | null
}

export interface CatalogProductVariantRecord {
  id: string
  product_id: string
  name?: string | null
  price?: number | null
  compare_at_price?: number | null
  stock_quantity?: number | null
  created_at?: ISODateTime | null
  color?: string | null
  size?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CatalogProductDetails {
  id: string
  name: string
  slug?: string | null
  description: string
  label: string
  priceLabel: string
  imageUrl?: string | null
  imageAlt?: string | null
  gallery: CatalogProductGalleryImage[]
  variants: CatalogProductVariantRecord[]
  availableColors: string[]
  availableSizes: string[]
  stockStatus: string
  stockCount: number | null
  selectedVariantId: string | null
  relatedProducts: CatalogProductCard[]
}
