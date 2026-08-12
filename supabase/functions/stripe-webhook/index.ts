import Stripe from 'https://esm.sh/stripe@22.4.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type PaymentConfirmation = {
  checkoutReference: string
  userId: string
  sessionId: string
  paymentIntentId: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function stripeId(value: string | { id: string } | null): string | null {
  if (typeof value === 'string') return value
  return value?.id ?? null
}

function readTrustedMetadata(metadata: Stripe.Metadata | null, sessionId: string, paymentIntentId: string): PaymentConfirmation | null {
  const checkoutReference = metadata?.checkout_reference
  const userId = metadata?.user_id

  if (!isUuid(checkoutReference) || !isUuid(userId)) {
    return null
  }

  return { checkoutReference, userId, sessionId, paymentIntentId }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Stripe webhook is missing required configuration')
    return jsonResponse({ error: 'Webhook is not configured' }, 500)
  }

  const signature = request.headers.get('Stripe-Signature')
  if (!signature) {
    console.warn('Stripe webhook rejected: missing signature')
    return jsonResponse({ error: 'Missing Stripe signature' }, 400)
  }

  const stripe = new Stripe(stripeSecretKey)
  let event: Stripe.Event
  try {
    // The unparsed request body is essential: parsing JSON before this changes
    // the signed bytes and would make signature validation meaningless.
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, stripeWebhookSecret)
  } catch (error) {
    console.warn('Stripe webhook rejected: signature verification failed', error)
    return jsonResponse({ error: 'Invalid Stripe signature' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const reconcileRefund = async (incoming: Stripe.Refund) => {
    const verified = await stripe.refunds.retrieve(incoming.id)
    const paymentIntentId = stripeId(verified.payment_intent)
    if (!paymentIntentId) return
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id')
      .eq('stripe_payment_intent', paymentIntentId)
      .maybeSingle()
    if (orderError || !order) {
      console.error('Refund does not match a known order', { refundId: verified.id, paymentIntentId, orderError })
      return
    }
    const rawStatus = String(verified.status || 'pending')
    const status = ['succeeded', 'failed', 'canceled'].includes(rawStatus) ? rawStatus : 'pending'
    const failureReason = typeof (verified as Stripe.Refund & { failure_reason?: string }).failure_reason === 'string'
      ? (verified as Stripe.Refund & { failure_reason?: string }).failure_reason
      : null
    const { error } = await adminClient.rpc('record_stripe_refund_event', {
      p_order_id: order.id,
      p_stripe_refund_id: verified.id,
      p_amount_cents: verified.amount,
      p_currency: verified.currency,
      p_status: status,
      p_failure_reason: failureReason,
      p_refund_record_id: isUuid(verified.metadata?.refund_record_id) ? verified.metadata.refund_record_id : null,
    })
    if (error) throw error
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sessionId = event.data.object.id
        if (!sessionId) {
          console.error('Stripe completed checkout event had no session ID', { eventId: event.id })
          return jsonResponse({ received: true })
        }

        // Re-fetch the session from Stripe.  The event is signed, but this also
        // verifies that the Session is complete and its PaymentIntent succeeded.
        const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['discounts'] })
        const paymentIntentId = stripeId(session.payment_intent)
        if (
          session.id !== sessionId ||
          session.mode !== 'payment' ||
          session.status !== 'complete' ||
          session.payment_status !== 'paid' ||
          !paymentIntentId
        ) {
          console.error('Stripe completed checkout did not verify as paid', {
            eventId: event.id,
            sessionId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
          })
          return jsonResponse({ received: true })
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        if (paymentIntent.status !== 'succeeded') {
          console.error('Stripe completed checkout PaymentIntent was not succeeded', {
            eventId: event.id,
            sessionId,
            paymentIntentId,
            paymentIntentStatus: paymentIntent.status,
          })
          return jsonResponse({ received: true })
        }

        const confirmation = readTrustedMetadata(session.metadata, session.id, paymentIntent.id)
        if (!confirmation) {
          console.error('Stripe completed checkout is missing trusted metadata', { eventId: event.id, sessionId })
          return jsonResponse({ received: true })
        }

        const { data, error } = await adminClient.rpc('finalize_paid_stripe_checkout', {
          p_checkout_reference: confirmation.checkoutReference,
          p_checkout_user_id: confirmation.userId,
          p_stripe_session_id: confirmation.sessionId,
          p_stripe_payment_intent: confirmation.paymentIntentId,
          p_payment_status: 'paid',
        })

        if (error || !data || (data as { ok?: boolean }).ok !== true) {
          console.error('Unable to finalize paid Stripe checkout', { eventId: event.id, sessionId, error, data })
          return jsonResponse({ error: 'Order finalization failed' }, 500)
        }

        const finalizedOrderId = (data as { order?: { id?: string } }).order?.id
        if (finalizedOrderId) {
          const checkout = session as Stripe.Checkout.Session & {
            collected_information?: { shipping_details?: unknown }
            discounts?: Array<{ promotion_code?: string | { id: string } | null }>
          }
          const shippingDetails = checkout.collected_information?.shipping_details
            ?? (checkout as Stripe.Checkout.Session & { shipping_details?: unknown }).shipping_details
          const detailError = await adminClient.rpc('apply_stripe_checkout_details', {
            p_order_id: finalizedOrderId,
            p_subtotal_cents: session.amount_subtotal ?? session.amount_total ?? 0,
            p_discount_cents: session.total_details?.amount_discount ?? 0,
            p_shipping_cents: session.total_details?.amount_shipping ?? 0,
            p_tax_cents: session.total_details?.amount_tax ?? 0,
            p_total_cents: session.amount_total ?? 0,
            p_metadata: {
              contact: session.customer_details ?? {},
              shipping_address: shippingDetails ?? {},
              billing_address: session.customer_details?.address ?? {},
            },
          })
          if (detailError.error) {
            console.error('Unable to persist Stripe checkout totals', { eventId: event.id, error: detailError.error })
            return jsonResponse({ error: 'Checkout detail reconciliation failed' }, 500)
          }

          const promotionId = stripeId(checkout.discounts?.[0]?.promotion_code ?? null)
          if (promotionId) {
            const { error: discountError } = await adminClient.rpc('record_discount_redemption', {
              p_stripe_promotion_code_id: promotionId,
              p_stripe_checkout_session_id: session.id,
              p_stripe_event_id: event.id,
            })
            if (discountError) {
              console.error('Unable to record discount redemption', { eventId: event.id, discountError })
              return jsonResponse({ error: 'Discount reconciliation failed' }, 500)
            }
          }
        }

        console.info('Stripe checkout finalized', {
          eventId: event.id,
          sessionId,
          idempotent: (data as { idempotent?: boolean }).idempotent === true,
        })
        return jsonResponse({ received: true })
      }

      case 'checkout.session.expired': {
        const sessionId = event.data.object.id
        if (!sessionId) {
          console.error('Stripe expired checkout event had no session ID', { eventId: event.id })
          return jsonResponse({ received: true })
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId)
        const checkoutReference = session.metadata?.checkout_reference
        if (session.id !== sessionId || session.status !== 'expired' || !isUuid(checkoutReference)) {
          console.error('Stripe expired checkout could not be verified', { eventId: event.id, sessionId })
          return jsonResponse({ received: true })
        }

        const { error } = await adminClient
          .from('stripe_checkout_attempts')
          .update({ status: 'expired' })
          .eq('id', checkoutReference)
          .eq('stripe_session_id', session.id)
          .neq('status', 'paid')

        if (error) {
          console.error('Unable to record expired Stripe checkout', { eventId: event.id, sessionId, error })
          return jsonResponse({ error: 'Checkout expiration update failed' }, 500)
        }

        return jsonResponse({ received: true })
      }

      case 'payment_intent.payment_failed': {
        const paymentIntentId = event.data.object.id
        if (!paymentIntentId) {
          console.error('Stripe failed payment event had no PaymentIntent ID', { eventId: event.id })
          return jsonResponse({ received: true })
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        const checkoutReference = paymentIntent.metadata?.checkout_reference
        if (!isUuid(checkoutReference) || paymentIntent.status === 'succeeded') {
          console.warn('Stripe failed payment could not be verified as failed', {
            eventId: event.id,
            paymentIntentId,
            paymentIntentStatus: paymentIntent.status,
          })
          return jsonResponse({ received: true })
        }

        const { error } = await adminClient
          .from('stripe_checkout_attempts')
          .update({ status: 'payment_failed', stripe_payment_intent: paymentIntent.id })
          .eq('id', checkoutReference)
          .neq('status', 'paid')

        if (error) {
          console.error('Unable to record failed Stripe payment', { eventId: event.id, paymentIntentId, error })
          return jsonResponse({ error: 'Payment failure update failed' }, 500)
        }

        return jsonResponse({ received: true })
      }

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        await reconcileRefund(event.data.object)
        return jsonResponse({ received: true })
      }

      case 'charge.refunded': {
        const charge = await stripe.charges.retrieve(event.data.object.id, { expand: ['refunds'] })
        for (const refund of charge.refunds?.data ?? []) await reconcileRefund(refund)
        return jsonResponse({ received: true })
      }

      default:
        console.info('Ignoring unexpected Stripe webhook event', { eventId: event.id, eventType: event.type })
        return jsonResponse({ received: true })
    }
  } catch (error) {
    console.error('Unhandled Stripe webhook error', { eventId: event.id, eventType: event.type, error })
    return jsonResponse({ error: 'Webhook processing failed' }, 500)
  }
})
