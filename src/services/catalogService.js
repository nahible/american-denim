import { listProductImages } from './productImagesService.ts'
import { listProductVariants } from './productVariantsService.ts'
import { listProducts } from './productsService.ts'
import { buildCatalogCard } from './productTransforms.js'

export async function fetchFeaturedProducts({ limit } = {}) {
  const productResponse = await listProducts({
      select: 'id, name, slug, metadata, featured, created_at',
    orderBy: 'created_at',
    ascending: false,
    limit,
  })

  if (productResponse.error) {
    return {
      data: [],
      error: productResponse.error,
    }
  }

  const products = productResponse.data ?? []

  if (products.length === 0) {
    return {
      data: [],
      error: null,
    }
  }

  const productIds = products.map((product) => product.id).filter(Boolean)

  const [imagesResponse, variantsResponse] = await Promise.all([
    listProductImages({
      select: 'id, product_id, url, alt_text, sort_order, created_at',
      filters: { product_id: productIds },
    }),
    listProductVariants({
      select: 'id, product_id, name, price, currency, compare_at_price, created_at',
      filters: { product_id: productIds },
    }),
  ])

  const images = imagesResponse.data ?? []
  const variants = variantsResponse.data ?? []

  if (imagesResponse.error || variantsResponse.error) {
    return {
      data: [],
      error: imagesResponse.error || variantsResponse.error,
    }
  }

  const productsById = new Map(products.map((product) => [product.id, product]))
  const imagesByProductId = new Map()
  const variantsByProductId = new Map()

  for (const image of images) {
    const current = imagesByProductId.get(image.product_id) ?? []
    current.push(image)
    imagesByProductId.set(image.product_id, current)
  }

  for (const variant of variants) {
    const current = variantsByProductId.get(variant.product_id) ?? []
    current.push(variant)
    variantsByProductId.set(variant.product_id, current)
  }

  const data = productIds
    .map((productId) => {
      const product = productsById.get(productId)
      if (!product) {
        return null
      }

      const productImages = imagesByProductId.get(product.id) ?? []
      const productVariants = variantsByProductId.get(product.id) ?? []

      return buildCatalogCard(product, productImages, productVariants)
    })
    .filter(Boolean)

  return {
    data,
    error: null,
  }
}
