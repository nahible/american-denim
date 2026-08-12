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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) return respond({ error: 'Discounts are not configured.' }, 500)
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in is required.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await adminClient.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return respond({ error: 'Your session is invalid.' }, 401)
  const { data: role } = await adminClient.from('user_roles').select('role').eq('user_id', authData.user.id).maybeSingle()
  if (role?.role !== 'admin') return respond({ error: 'Administrator access is required.' }, 403)

  let payload: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!isObject(parsed)) return respond({ error: 'Invalid discount request.' }, 400)
    payload = parsed
  } catch { return respond({ error: 'Invalid discount request.' }, 400) }

  const stripe = new Stripe(stripeSecretKey)
  if (payload.action === 'deactivate') {
    if (typeof payload.id !== 'string') return respond({ error: 'Discount ID is required.' }, 400)
    const { data: discount } = await adminClient.from('discounts').select('*').eq('id', payload.id).maybeSingle()
    if (!discount) return respond({ error: 'Discount not found.' }, 404)
    if (discount.stripe_promotion_code_id) await stripe.promotionCodes.update(discount.stripe_promotion_code_id, { active: false })
    await adminClient.from('discounts').update({ active: false }).eq('id', discount.id)
    await adminClient.from('admin_audit_log').insert({ admin_user_id: authData.user.id, action: 'discount.deactivated', entity_type: 'discount', entity_id: discount.id, old_values: { active: true }, new_values: { active: false } })
    return respond({ discount: { ...discount, active: false } })
  }

  const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : ''
  const discountType = payload.discountType
  const percentOff = Number(payload.percentOff)
  const amountOffCents = Number(payload.amountOffCents)
  const maxRedemptions = payload.maxRedemptions == null || payload.maxRedemptions === '' ? null : Number(payload.maxRedemptions)
  const minimumOrderCents = payload.minimumOrderCents == null || payload.minimumOrderCents === '' ? null : Number(payload.minimumOrderCents)
  const expiresAt = typeof payload.expiresAt === 'string' && payload.expiresAt ? new Date(payload.expiresAt) : null
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) return respond({ error: 'Codes must be 3–32 letters, numbers, or hyphens.' }, 400)
  if (discountType !== 'percentage' && discountType !== 'fixed_amount') return respond({ error: 'Choose a valid discount type.' }, 400)
  if (discountType === 'percentage' && (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100)) return respond({ error: 'Percentage must be between 0 and 100.' }, 400)
  if (discountType === 'fixed_amount' && (!Number.isSafeInteger(amountOffCents) || amountOffCents <= 0)) return respond({ error: 'Fixed amount must be a positive cent value.' }, 400)
  if (maxRedemptions !== null && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions <= 0)) return respond({ error: 'Maximum redemptions must be positive.' }, 400)
  if (minimumOrderCents !== null && (!Number.isSafeInteger(minimumOrderCents) || minimumOrderCents < 0)) return respond({ error: 'Minimum order must be zero or greater.' }, 400)
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) return respond({ error: 'Expiration must be in the future.' }, 400)

  const replaceId = typeof payload.replaceId === 'string' ? payload.replaceId : null
  const { data: existing } = replaceId
    ? await adminClient.from('discounts').select('*').eq('id', replaceId).maybeSingle()
    : await adminClient.from('discounts').select('*').eq('code', code).maybeSingle()
  if (existing?.active && existing.id !== replaceId) return respond({ error: 'An active discount already uses this code.' }, 409)

  try {
    if (existing?.active && existing.stripe_promotion_code_id) {
      await stripe.promotionCodes.update(existing.stripe_promotion_code_id, { active: false })
      await adminClient.from('discounts').update({ active: false }).eq('id', existing.id)
    }
    const coupon = await stripe.coupons.create({
      duration: 'once',
      ...(discountType === 'percentage' ? { percent_off: percentOff } : { amount_off: amountOffCents, currency: 'usd' }),
      metadata: { code, created_by: authData.user.id },
    }, { idempotencyKey: `coupon-${String(payload.idempotencyKey || crypto.randomUUID())}` })
    const promotion = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      active: true,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}),
      ...(minimumOrderCents !== null ? { restrictions: { minimum_amount: minimumOrderCents, minimum_amount_currency: 'usd' } } : {}),
      metadata: { created_by: authData.user.id },
    }, { idempotencyKey: `promotion-${String(payload.idempotencyKey || crypto.randomUUID())}` })

    const record = {
      code,
      discount_type: discountType,
      percent_off: discountType === 'percentage' ? percentOff : null,
      amount_off_cents: discountType === 'fixed_amount' ? amountOffCents : null,
      active: true,
      expires_at: expiresAt?.toISOString() ?? null,
      max_redemptions: maxRedemptions,
      minimum_order_cents: minimumOrderCents,
      stripe_coupon_id: coupon.id,
      stripe_promotion_code_id: promotion.id,
      created_by: authData.user.id,
    }
    const query = existing
      ? adminClient.from('discounts').update(record).eq('id', existing.id).select().single()
      : adminClient.from('discounts').insert(record).select().single()
    const { data: saved, error: saveError } = await query
    if (saveError || !saved) throw saveError || new Error('Discount database write failed')
    await adminClient.from('admin_audit_log').insert({ admin_user_id: authData.user.id, action: existing ? 'discount.replaced' : 'discount.created', entity_type: 'discount', entity_id: saved.id, old_values: existing ? { code: existing.code, discount_type: existing.discount_type, active: existing.active } : null, new_values: { code, discount_type: discountType, active: true } })
    return respond({ discount: saved }, 201)
  } catch (error) {
    console.error('Stripe discount operation failed', error)
    return respond({ error: 'Stripe could not create this discount. Verify that the code is not already active.' }, 502)
  }
})
