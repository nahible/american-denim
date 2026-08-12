import { supabase } from '../lib/supabase.js'

function unavailable() {
  return { data: null, error: new Error('Supabase is not configured.') }
}

export async function getAdminDashboard() {
  if (!supabase) return unavailable()
  return supabase.rpc('admin_dashboard')
}

export async function listAdminOrders() {
  if (!supabase) return unavailable()
  const { data: orders, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(250)
  if (error) return { data: null, error }
  const userIds = [...new Set((orders ?? []).map((order) => order.user_id).filter(Boolean))]
  const { data: users, error: usersError } = userIds.length
    ? await supabase.from('users').select('id,email,full_name,created_at').in('id', userIds)
    : { data: [], error: null }
  if (usersError) return { data: null, error: usersError }
  const usersById = new Map((users ?? []).map((user) => [user.id, user]))
  const orderIds = (orders ?? []).map((order) => order.id)
  const { data: items, error: itemsError } = orderIds.length
    ? await supabase.from('order_items').select('order_id,quantity').in('order_id', orderIds)
    : { data: [], error: null }
  if (itemsError) return { data: null, error: itemsError }
  const counts = new Map()
  for (const item of items ?? []) counts.set(item.order_id, (counts.get(item.order_id) || 0) + item.quantity)
  return { data: (orders ?? []).map((order) => ({ ...order, customer: usersById.get(order.user_id), item_count: counts.get(order.id) || 0 })), error: null }
}

export async function getAdminOrder(id) {
  if (!supabase) return unavailable()
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle()
  if (error || !order) return { data: null, error: error || new Error('Order not found.') }
  const [itemsResponse, userResponse, refundsResponse] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
    supabase.from('users').select('id,email,full_name,created_at').eq('id', order.user_id).maybeSingle(),
    supabase.from('refunds').select('*').eq('order_id', id).order('created_at', { ascending: false }),
  ])
  const nestedError = itemsResponse.error || userResponse.error || refundsResponse.error
  return { data: nestedError ? null : { ...order, items: itemsResponse.data ?? [], customer: userResponse.data, refunds: refundsResponse.data ?? [] }, error: nestedError }
}

export async function updateFulfillment(orderId, fulfillmentStatus, carrier, trackingNumber) {
  if (!supabase) return unavailable()
  return supabase.rpc('admin_update_fulfillment', {
    p_order_id: orderId,
    p_fulfillment_status: fulfillmentStatus,
    p_carrier: carrier || null,
    p_tracking_number: trackingNumber || null,
  })
}

export async function listAdminProducts() {
  if (!supabase) return unavailable()
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*), product_images(*)')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function getAdminProduct(id) {
  if (!supabase) return unavailable()
  return supabase.from('products').select('*, product_variants(*), product_images(*)').eq('id', id).maybeSingle()
}

export async function saveProduct(product) {
  if (!supabase) return unavailable()
  const payload = { name: product.name.trim(), slug: product.slug.trim(), description: product.description.trim() || null, status: product.status, featured: product.featured }
  return product.id
    ? supabase.from('products').update(payload).eq('id', product.id).select().single()
    : supabase.from('products').insert(payload).select().single()
}

export async function saveVariant(variant) {
  if (!supabase) return unavailable()
  const payload = {
    product_id: variant.product_id,
    sku: variant.sku.trim() || null,
    name: variant.name.trim() || null,
    price: Number(variant.price),
    currency: 'USD',
    color: variant.color.trim() || null,
    size: variant.size.trim() || null,
    low_stock_threshold: Number(variant.low_stock_threshold),
    status: variant.status,
  }
  return variant.id
    ? supabase.from('product_variants').update(payload).eq('id', variant.id).select().single()
    : supabase.from('product_variants').insert(payload).select().single()
}

export async function uploadProductImage(userId, productId, file) {
  if (!supabase) return unavailable()
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/${productId}/${crypto.randomUUID()}.${extension}`
  const upload = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false })
  if (upload.error) return upload
  const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path)
  return supabase.from('product_images').insert({ product_id: productId, url: publicData.publicUrl, alt_text: file.name }).select().single()
}

export async function removeProductImage(image) {
  if (!supabase) return unavailable()
  const marker = '/storage/v1/object/public/product-images/'
  const markerIndex = typeof image.url === 'string' ? image.url.indexOf(marker) : -1
  if (markerIndex >= 0) {
    const path = decodeURIComponent(image.url.slice(markerIndex + marker.length))
    const storageResponse = await supabase.storage.from('product-images').remove([path])
    if (storageResponse.error) return storageResponse
  }
  return supabase.from('product_images').delete().eq('id', image.id)
}

export async function adjustInventory(variantId, type, quantity, reason) {
  if (!supabase) return unavailable()
  return supabase.rpc('admin_adjust_inventory', { p_variant_id: variantId, p_adjustment_type: type, p_quantity: quantity, p_reason: reason })
}

export async function listCustomers() {
  if (!supabase) return unavailable()
  const [usersResponse, ordersResponse] = await Promise.all([
    supabase.from('users').select('id,email,full_name,created_at').order('created_at', { ascending: false }),
    supabase.from('orders').select('id,user_id,total,payment_status,refunded_amount_cents,created_at,metadata,refunds(status,amount_cents,currency,created_at)').order('created_at', { ascending: false }),
  ])
  const error = usersResponse.error || ordersResponse.error
  if (error) return { data: null, error }
  const ordersByUser = new Map()
  for (const order of ordersResponse.data ?? []) {
    const bucket = ordersByUser.get(order.user_id) || []
    bucket.push(order)
    ordersByUser.set(order.user_id, bucket)
  }
  return { data: (usersResponse.data ?? []).map((user) => {
    const orders = ordersByUser.get(user.id) || []
    const paid = orders.filter((order) => ['paid', 'partially_refunded', 'refunded'].includes(order.payment_status))
    return { ...user, orders, order_count: orders.length, total_spend: paid.reduce((sum, order) => sum + Number(order.total || 0) - Number(order.refunded_amount_cents || 0) / 100, 0), latest_order_at: orders[0]?.created_at ?? null }
  }), error: null }
}

export async function listDiscounts() {
  if (!supabase) return unavailable()
  return supabase.from('discounts').select('*').order('created_at', { ascending: false })
}

export async function invokeAdminFunction(name, body) {
  if (!supabase) return unavailable()
  const { data, error } = await supabase.functions.invoke(name, { body })
  return { data, error: error || (data?.error ? new Error(data.error) : null) }
}
