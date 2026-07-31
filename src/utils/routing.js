export function getSupabaseAuthCallbackType(hash) {
  const normalizedHash = hash.replace(/^#/, '')

  if (!normalizedHash) {
    return null
  }

  const params = new URLSearchParams(normalizedHash)

  if (params.has('access_token') || params.has('refresh_token') || params.has('code')) {
    return 'success'
  }

  if (params.has('error') || params.has('error_description') || params.has('error_code')) {
    return 'error'
  }

  return null
}

export function getRouteFromHash(hash) {
  const authCallbackType = getSupabaseAuthCallbackType(hash)

  if (authCallbackType === 'success') {
    return { page: 'profile', productId: null }
  }

  if (authCallbackType === 'error') {
    return { page: 'login', productId: null }
  }

  const normalizedHash = hash.replace(/^#/, '')

  if (!normalizedHash) {
    return { page: 'home', productId: null }
  }

  const pageRoutes = new Set([
    'shop',
    'story',
    'about',
    'lookbook',
    'contact',
    'cart',
    'checkout',
    'login',
    'signup',
    'profile',
    'orders',
    '404',
  ])

  if (pageRoutes.has(normalizedHash)) {
    return { page: normalizedHash, productId: null }
  }

  const productMatch = normalizedHash.match(/^product\/(.+)$/)
  if (productMatch?.[1]) {
    let productId

    try {
      productId = decodeURIComponent(productMatch[1])
    } catch {
      return { page: '404', productId: null }
    }

    return {
      page: 'product',
      productId,
    }
  }

  return { page: '404', productId: null }
}
