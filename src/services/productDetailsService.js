import { getProductById, listProducts } from './productsService.ts'
import { listProductImages } from './productImagesService.ts'
import { listProductVariants } from './productVariantsService.ts'
import { buildCatalogCard, buildProductDetails } from './productTransforms.js'

function uniqueById(items) {
  const map = new Map()

  for (const item of items) {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item)
    }
  }

  return Array.from(map.values())
}

function getRelatedKeys(product) {
  const metadata = product && typeof product.metadata === 'object' ? product.metadata : null
  const keys = []

  for (const key of ['collection', 'category', 'line', 'series', 'group', 'tag', 'tags']) {
    const value = product?.[key] ?? metadata?.[key]
    if (Array.isArray(value)) {
      keys.push(...value)
    } else if (typeof value === 'string' && value.trim()) {
      keys.push(value.trim())
    }
  }

  return uniqueById(keys.map((value) => ({ id: value }))).map((item) => item.id)
}

function scoreRelatedProduct(product, sourceKeys) {
  const metadata = product && typeof product.metadata === 'object' ? product.metadata : null
  const productKeys = new Set()

  for (const key of ['collection', 'category', 'line', 'series', 'group', 'tag', 'tags']) {
    const value = product?.[key] ?? metadata?.[key]
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
          productKeys.add(entry.trim())
        }
      }
    } else if (typeof value === 'string' && value.trim()) {
      productKeys.add(value.trim())
    }
  }

  let score = 0
  for (const key of sourceKeys) {
    if (productKeys.has(key)) {
      score += 1
    }
  }

  return score
}

async function fetchRelatedProducts(product, limit = 4) {
  const relatedKeys = getRelatedKeys(product)
  const candidatesResponse = await listProducts({
    select: 'id, name, slug, metadata, featured, created_at',
    orderBy: 'created_at',
    ascending: false,
    limit: 24,
  })

  if (candidatesResponse.error) {
    return { data: [], error: candidatesResponse.error }
  }

  const candidateProducts = (candidatesResponse.data ?? []).filter((candidate) => candidate.id !== product.id)
  const scoredCandidates = candidateProducts
    .map((candidate) => ({
      candidate,
      score: scoreRelatedProduct(candidate, relatedKeys),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const leftCreated = left.candidate.created_at ?? ''
      const rightCreated = right.candidate.created_at ?? ''
      return rightCreated.localeCompare(leftCreated)
    })

  const chosenCandidates = uniqueById(
    scoredCandidates
      .filter((entry) => entry.score > 0)
      .map((entry) => entry.candidate)
      .concat(candidateProducts)
  ).slice(0, limit)

  if (!chosenCandidates.length) {
    return { data: [], error: null }
  }

  const relatedIds = chosenCandidates.map((candidate) => candidate.id)

  const [imagesResponse, variantsResponse] = await Promise.all([
    listProductImages({
      select: 'id, product_id, url, alt_text, sort_order, created_at',
      filters: { product_id: relatedIds },
    }),
    listProductVariants({
      select: 'id, product_id, name, price, currency, color, size, compare_at_price, stock_quantity, created_at',
      filters: { product_id: relatedIds },
    }),
  ])

  if (imagesResponse.error || variantsResponse.error) {
    return {
      data: [],
      error: imagesResponse.error || variantsResponse.error,
    }
  }

  const imagesByProductId = new Map()
  const variantsByProductId = new Map()

  for (const image of imagesResponse.data ?? []) {
    const current = imagesByProductId.get(image.product_id) ?? []
    current.push(image)
    imagesByProductId.set(image.product_id, current)
  }

  for (const variant of variantsResponse.data ?? []) {
    const current = variantsByProductId.get(variant.product_id) ?? []
    current.push(variant)
    variantsByProductId.set(variant.product_id, current)
  }

  const relatedProducts = chosenCandidates.map((candidate) =>
    buildCatalogCard(candidate, imagesByProductId.get(candidate.id) ?? [], variantsByProductId.get(candidate.id) ?? []),
  )

  return { data: relatedProducts, error: null }
}

export async function fetchProductDetails(productId, { relatedLimit = 4 } = {}) {
  const productResponse = await getProductById(productId)

  if (productResponse.error) {
    return {
      data: null,
      error: productResponse.error,
      relatedError: null,
    }
  }

  if (!productResponse.data) {
    return {
      data: null,
      error: new Error('Product not found.'),
      relatedError: null,
    }
  }

  const [imagesResponse, variantsResponse, relatedResponse] = await Promise.all([
    listProductImages({
      select: 'id, product_id, url, alt_text, sort_order, created_at',
      filters: { product_id: [productId] },
    }),
    listProductVariants({
      select: 'id, product_id, name, price, currency, color, size, compare_at_price, stock_quantity, created_at',
      filters: { product_id: [productId] },
    }),
    fetchRelatedProducts(productResponse.data, relatedLimit).catch((error) => ({ data: [], error })),
  ])

  if (imagesResponse.error || variantsResponse.error) {
    return {
      data: null,
      error: imagesResponse.error || variantsResponse.error,
      relatedError: relatedResponse.error ?? null,
    }
  }

  return {
    data: {
      ...buildProductDetails(productResponse.data, imagesResponse.data ?? [], variantsResponse.data ?? []),
      relatedProducts: relatedResponse.data ?? [],
    },
    error: null,
    relatedError: relatedResponse.error ?? null,
  }
}
