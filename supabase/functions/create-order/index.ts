import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, details: Record<string, unknown> = {}) {
  return response({ ok: false, error: { code, message, details } })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests are supported.')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ ok: false, error: { code: 'SERVER_CONFIGURATION', message: 'Order service is not configured.' } }, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return errorResponse('UNAUTHENTICATED', 'You need to sign in before submitting an order.')
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const token = authorization.slice('Bearer '.length)
  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) {
    return errorResponse('UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.')
  }

  let payload: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!isObject(parsed)) {
      return errorResponse('INVALID_REQUEST', 'The order request is invalid.')
    }
    payload = parsed
  } catch {
    return errorResponse('INVALID_REQUEST', 'The order request is invalid.')
  }

  const requestedUserId = payload.userId
  if (requestedUserId !== undefined && requestedUserId !== authData.user.id) {
    return errorResponse('UNAUTHENTICATED', 'The order user does not match the signed-in account.')
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return errorResponse('EMPTY_CART', 'Add an item to your cart before submitting an order.')
  }

  const items: Array<{ variant_id: string; quantity: number }> = []
  for (const item of payload.items) {
    if (!isObject(item) || !isUuid(item.variantId) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return errorResponse('INVALID_VARIANT', 'One or more selected product variants are invalid.')
    }
    items.push({ variant_id: item.variantId, quantity: item.quantity })
  }

  const { data, error } = await adminClient.rpc('create_customer_order', {
    p_user_id: authData.user.id,
    p_items: items,
    p_contact: isObject(payload.contact) ? payload.contact : {},
    p_shipping_address: isObject(payload.shippingAddress) ? payload.shippingAddress : {},
    p_billing_address: isObject(payload.billingAddress) ? payload.billingAddress : {},
  })

  if (error) {
    return response({ ok: false, error: { code: 'ORDER_CREATION_FAILED', message: 'We could not create your order. Please try again.' } }, 500)
  }

  return response(data as Record<string, unknown>)
})
