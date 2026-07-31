import { getPublicStorageUrl, STORAGE_BUCKETS } from './storageService.js'

function asObject(value) {
  return value && typeof value === 'object' ? value : null
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function firstText(values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) {
      return text
    }
  }

  return ''
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

export function formatPrice(value, currency = 'USD') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Price soon'
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${value.toFixed(0)}`
  }
}

export function sortImages(images) {
  return [...images].sort((left, right) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    const leftCreated = left.created_at ?? ''
    const rightCreated = right.created_at ?? ''

    return leftCreated.localeCompare(rightCreated)
  })
}

export function sortVariants(variants) {
  return [...variants].sort((left, right) => {
    const leftPrice = typeof left.price === 'number' ? left.price : Number.POSITIVE_INFINITY
    const rightPrice = typeof right.price === 'number' ? right.price : Number.POSITIVE_INFINITY

    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice
    }

    const leftCreated = left.created_at ?? ''
    const rightCreated = right.created_at ?? ''

    return leftCreated.localeCompare(rightCreated)
  })
}

export function pickPrimaryImage(images) {
  const [firstImage] = sortImages(images)
  return firstImage ?? null
}

export function pickPrimaryVariant(variants) {
  const [firstVariant] = sortVariants(variants)
  return firstVariant ?? null
}

export function getMetadataValue(record, keys) {
  const metadata = asObject(record?.metadata)

  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    const metadataValue = metadata?.[key]
    if (Array.isArray(metadataValue)) {
      const arrayValue = firstText(metadataValue)
      if (arrayValue) {
        return arrayValue
      }
    } else if (typeof metadataValue === 'string' && metadataValue.trim()) {
      return metadataValue.trim()
    } else if (typeof metadataValue === 'number' && Number.isFinite(metadataValue)) {
      return String(metadataValue)
    }
  }

  return ''
}

export function getMetadataList(record, keys) {
  const values = []
  const metadata = asObject(record?.metadata)

  for (const key of keys) {
    const value = record?.[key]
    if (Array.isArray(value)) {
      values.push(...value)
      continue
    }

    if (typeof value === 'string' && value.trim()) {
      values.push(value)
      continue
    }

    const metadataValue = metadata?.[key]
    if (Array.isArray(metadataValue)) {
      values.push(...metadataValue)
    } else if (typeof metadataValue === 'string' && metadataValue.trim()) {
      values.push(metadataValue)
    }
  }

  return uniqueStrings(values)
}

export function pickProductLabel(product) {
  return firstText([
    getMetadataValue(product, ['label', 'photo_label', 'subtitle', 'tagline']),
    normalizeText(product?.name),
    'New drop',
  ]) || 'New drop'
}

export function pickProductDescription(product) {
  return firstText([
    getMetadataValue(product, ['description', 'long_description', 'copy', 'details']),
    normalizeText(product?.description),
  ])
}

export function pickProductCategory(product) {
  return getMetadataValue(product, ['category', 'collection', 'type', 'group', 'line']) || 'Uncategorized'
}

export function isFeaturedProduct(product) {
  const metadata = asObject(product?.metadata)
  const value = product?.featured ?? metadata?.featured

  return value === true || value === 1 || (typeof value === 'string' && value.trim().toLowerCase() === 'true')
}

export function getVariantColor(variant) {
  return getMetadataValue(variant, ['color', 'colour', 'shade', 'tone', 'hue'])
}

export function getVariantSize(variant) {
  return getMetadataValue(variant, ['size', 'fit', 'waist', 'inseam', 'length'])
}

export function getVariantStockCount(variant) {
  const value = variant?.stock_quantity

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

export function getStockStatus(variant) {
  const stockCount = getVariantStockCount(variant)

  if (stockCount === null) {
    return 'Availability pending'
  }

  if (stockCount <= 0) {
    return 'Out of stock'
  }

  if (stockCount <= 5) {
    return `Only ${stockCount} left`
  }

  return 'In stock'
}

export function matchVariant(variants, { color = '', size = '' } = {}) {
  if (!variants.length) {
    return null
  }

  const normalizedColor = normalizeText(color).toLowerCase()
  const normalizedSize = normalizeText(size).toLowerCase()

  const matches = variants.filter((variant) => {
    const variantColor = getVariantColor(variant).toLowerCase()
    const variantSize = getVariantSize(variant).toLowerCase()

    const colorMatches = !normalizedColor || normalizedColor === variantColor
    const sizeMatches = !normalizedSize || normalizedSize === variantSize

    return colorMatches && sizeMatches
  })

  if (matches.length) {
    return matches[0]
  }

  const colorMatches = normalizedColor
    ? variants.filter((variant) => getVariantColor(variant).toLowerCase() === normalizedColor)
    : []
  if (colorMatches.length) {
    return colorMatches[0]
  }

  const sizeMatches = normalizedSize
    ? variants.filter((variant) => getVariantSize(variant).toLowerCase() === normalizedSize)
    : []
  if (sizeMatches.length) {
    return sizeMatches[0]
  }

  return pickPrimaryVariant(variants)
}

export function buildCatalogCard(product, images, variants) {
  const primaryImage = pickPrimaryImage(images)
  const primaryVariant = pickPrimaryVariant(variants)

  return {
    id: product.id,
    name: normalizeText(product?.name) || 'New drop',
    slug: product.slug ?? null,
    label: pickProductLabel(product),
    category: pickProductCategory(product),
    featured: isFeaturedProduct(product),
    createdAt: product.created_at ?? null,
    price: primaryVariant?.price ?? null,
    currency: primaryVariant?.currency || 'USD',
    priceLabel: formatPrice(primaryVariant?.price ?? null, 'USD'),
    imageUrl: getPublicStorageUrl(STORAGE_BUCKETS.productImages, primaryImage?.url),
    imageAlt: primaryImage?.alt_text ?? product?.name ?? 'Product image',
    href: `#product/${encodeURIComponent(product.id)}`,
  }
}

export function buildProductDetails(product, images, variants) {
  const sortedImages = sortImages(images)
  const gallery = sortedImages.map((image) => ({
    ...image,
    url: getPublicStorageUrl(STORAGE_BUCKETS.productImages, image.url),
  }))
  const primaryVariant = pickPrimaryVariant(variants)
  const availableColors = getMetadataList(variants, ['color', 'colour', 'shade', 'tone', 'hue'])
  const availableSizes = getMetadataList(variants, ['size', 'fit', 'waist', 'inseam', 'length'])

  return {
    id: product.id,
    name: normalizeText(product?.name) || 'Product',
    slug: product.slug ?? null,
    description: pickProductDescription(product),
    label: pickProductLabel(product),
    priceLabel: formatPrice(primaryVariant?.price ?? null, 'USD'),
    imageUrl: gallery[0]?.url ?? null,
    imageAlt: sortedImages[0]?.alt_text ?? product?.name ?? 'Product image',
    gallery,
    variants,
    availableColors,
    availableSizes,
    stockStatus: getStockStatus(primaryVariant),
    stockCount: getVariantStockCount(primaryVariant),
    selectedVariantId: primaryVariant?.id ?? null,
  }
}
