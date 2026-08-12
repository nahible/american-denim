import Stripe from 'https://esm.sh/stripe@22.4.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) return respond({ error: 'Refunds are not configured.' }, 500)
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in is required.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await adminClient.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return respond({ error: 'Your session is invalid.' }, 401)
  const { data: role } = await adminClient.from('user_roles').select('role').eq('user_id', authData.user.id).maybeSingle()
  if (role?.role !== 'admin') return respond({ error: 'Administrator access is required.' }, 403)

  let payload: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!isObject(parsed)) return respond({ error: 'Invalid refund request.' }, 400)
    payload = parsed
  } catch {
    return respond({ error: 'Invalid refund request.' }, 400)
  }

  if (!isUuid(payload.orderId) || !isUuid(payload.idempotencyKey)) return respond({ error: 'Invalid refund request.' }, 400)
  const amountCents = Number(payload.amountCents)
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return respond({ error: 'Enter a valid refund amount.' }, 400)
  const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 500) : ''
  const restock = payload.restock === true

  const { data: duplicate } = await adminClient.from('refunds').select('id, stripe_refund_id, status').eq('idempotency_key', payload.idempotencyKey).maybeSingle()
  if (duplicate) return respond({ error: 'This refund request was already submitted.', refund: duplicate }, 409)

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id,total,currency,stripe_payment_intent,payment_status')
    .eq('id', payload.orderId)
    .maybeSingle()
  if (orderError || !order) return respond({ error: 'Order not found.' }, 404)
  if (!order.stripe_payment_intent || !['paid', 'partially_refunded'].includes(order.payment_status)) {
    return respond({ error: 'This order is not refundable.' }, 409)
  }

  const { data: existingRefunds, error: refundError } = await adminClient
    .from('refunds')
    .select('amount_cents,status')
    .eq('order_id', order.id)
    .in('status', ['pending', 'succeeded'])
  if (refundError) return respond({ error: 'Could not validate the refundable balance.' }, 500)
  const reservedCents = (existingRefunds ?? []).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0)
  const totalCents = Math.round(Number(order.total) * 100)
  const remainingCents = totalCents - reservedCents
  if (amountCents > remainingCents) return respond({ error: `The maximum refundable amount is ${remainingCents} cents.` }, 409)
  if (restock && amountCents !== remainingCents) {
    return respond({ error: 'Items can only be restocked when this refund completes the full order refund.' }, 400)
  }

  const { data: refundRow, error: insertError } = await adminClient.from('refunds').insert({
    order_id: order.id,
    idempotency_key: payload.idempotencyKey,
    amount_cents: amountCents,
    currency: String(order.currency || 'USD').toUpperCase(),
    status: 'pending',
    reason: reason || null,
    admin_user_id: authData.user.id,
    restock_requested: restock,
  }).select('id').single()
  if (insertError || !refundRow) return respond({ error: 'Could not reserve this refund request.' }, 409)

  try {
    const stripe = new Stripe(stripeSecretKey)
    const stripeRefund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent,
      amount: amountCents,
      metadata: { order_id: order.id, refund_record_id: refundRow.id, admin_user_id: authData.user.id },
    }, { idempotencyKey: String(payload.idempotencyKey) })

    await adminClient.from('refunds').update({ stripe_refund_id: stripeRefund.id }).eq('id', refundRow.id)
    await adminClient.from('admin_audit_log').insert({
      admin_user_id: authData.user.id,
      action: 'refund.requested',
      entity_type: 'order',
      entity_id: order.id,
      new_values: { refund_id: refundRow.id, amount_cents: amountCents, restock_requested: restock, reason: reason || null },
    })
    return respond({ refund: { id: refundRow.id, stripeRefundId: stripeRefund.id, status: 'pending' } }, 202)
  } catch (error) {
    console.error('Stripe refund creation failed', error)
    await adminClient.from('refunds').update({ status: 'failed', stripe_failure_reason: 'Stripe rejected the refund request.' }).eq('id', refundRow.id)
    return respond({ error: 'Stripe could not create this refund. No additional request should be submitted until the order is refreshed.' }, 502)
  }
})
