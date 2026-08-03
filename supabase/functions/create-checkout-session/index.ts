import Stripe from 'https://esm.sh/stripe@22.4.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ITEM_QUANTITY = 10000

type CheckoutItem = {
  variant_id: string
  product_name: string
  variant_name: string
  quantity: number
  unit_price: number | string
  currency: string
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return response({ error: { code, message, details } }, status)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toMinorUnits(price: number | string): number | null {
  const parsed = typeof price === 'number' ? price : Number(price)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  const minorUnits = Math.round((parsed + Number.EPSILON) * 100)
  return Number.isSafeInteger(minorUnits) ? minorUnits : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests are supported.', {}, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/+$/, '')
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !siteUrl) {
    return errorResponse('SERVER_CONFIGURATION', 'Checkout is not configured.', {}, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return errorResponse('UNAUTHENTICATED', 'You need to sign in before checking out.', {}, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const token = authorization.slice('Bearer '.length)
  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) {
    return errorResponse('UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.', {}, 401)
  }

  let payload: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!isObject(parsed)) {
      return errorResponse('INVALID_REQUEST', 'The checkout request is invalid.')
    }
    payload = parsed
  } catch {
    return errorResponse('INVALID_REQUEST', 'The checkout request is invalid.')
  }

  if (payload.userId !== authData.user.id) {
    return errorResponse('UNAUTHENTICATED', 'The checkout user does not match the signed-in account.', {}, 401)
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return errorResponse('EMPTY_CART', 'Add an item to your cart before checking out.')
  }

  const requestedItems: Array<{ variant_id: string; quantity: number }> = []
  for (const item of payload.items) {
    if (!isObject(item) || !isUuid(item.variantId) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ITEM_QUANTITY) {
      return errorResponse('INVALID_VARIANT', 'One or more selected product variants are invalid.')
    }
    requestedItems.push({ variant_id: item.variantId, quantity: item.quantity })
  }

  const { data: validation, error: validationError } = await adminClient.rpc('validate_checkout_items', {
    p_items: requestedItems,
  })
  if (validationError || !isObject(validation)) {
    return errorResponse('CHECKOUT_VALIDATION_FAILED', 'We could not validate your cart. Please try again.', {}, 500)
  }

  if (validation.ok !== true) {
    const error = isObject(validation.error) ? validation.error : {}
    return errorResponse(
      typeof error.code === 'string' ? error.code : 'CHECKOUT_VALIDATION_FAILED',
      typeof error.message === 'string' ? error.message : 'We could not validate your cart.',
      isObject(error.details) ? error.details : {},
    )
  }

  if (!Array.isArray(validation.items) || validation.items.length === 0) {
    return errorResponse('EMPTY_CART', 'Add an item to your cart before checking out.')
  }

  // This is the server-validated order input that the webhook will use.  Only
  // its opaque ID is sent to Stripe; prices and totals never travel back from
  // Stripe into order creation.
  const trustedItems = (validation.items as CheckoutItem[]).map((item) => ({
    variant_id: item.variant_id,
    quantity: item.quantity,
  }))

  const { data: checkoutAttempt, error: checkoutAttemptError } = await adminClient
    .from('stripe_checkout_attempts')
    .insert({ user_id: authData.user.id, items: trustedItems })
    .select('id')
    .single()

  if (checkoutAttemptError || !checkoutAttempt?.id) {
    console.error('Unable to create trusted Stripe checkout reference', checkoutAttemptError)
    return errorResponse('CHECKOUT_SESSION_FAILED', 'We could not start checkout. Please try again.', {}, 500)
  }

  const checkoutMetadata = {
    checkout_reference: checkoutAttempt.id,
    user_id: authData.user.id,
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
  for (const item of validation.items as CheckoutItem[]) {
    const unitAmount = toMinorUnits(item.unit_price)
    if (!item.product_name || !item.variant_id || !Number.isInteger(item.quantity) || item.quantity <= 0 || unitAmount === null) {
      return errorResponse('CHECKOUT_VALIDATION_FAILED', 'We could not validate your cart. Please try again.', {}, 500)
    }

    lineItems.push({
      price_data: {
        currency: item.currency.toLowerCase(),
        product_data: {
          name: item.product_name,
          description: item.variant_name,
          metadata: { variant_id: item.variant_id },
        },
        unit_amount: unitAmount,
      },
      quantity: item.quantity,
    })
  }

  try {
    const stripe = new Stripe(stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: authData.user.email ?? undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      automatic_tax: { enabled: false },
      success_url: `${siteUrl}/#payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#cart`,
      line_items: lineItems,
      metadata: checkoutMetadata,
      payment_intent_data: { metadata: checkoutMetadata },
    })

    if (!session.url) {
      return errorResponse('CHECKOUT_SESSION_FAILED', 'We could not start checkout. Please try again.', {}, 502)
    }

    const { error: sessionRecordError } = await adminClient
      .from('stripe_checkout_attempts')
      .update({ stripe_session_id: session.id })
      .eq('id', checkoutAttempt.id)

    // The webhook can bind this ID atomically if this write races it.  Logging
    // makes an infrastructure failure visible without dropping a valid payment.
    if (sessionRecordError) {
      console.error('Unable to record Stripe Checkout Session ID', sessionRecordError)
    }

    return response({ url: session.url })
  } catch (error) {
    console.error('Stripe Checkout session creation failed', error)
    return errorResponse('CHECKOUT_SESSION_FAILED', 'We could not start checkout. Please try again.', {}, 502)
  }
})
