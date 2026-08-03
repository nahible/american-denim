import { supabase } from '../lib/supabase.js'

function configurationError() {
  return new Error('Supabase is not configured.')
}

export async function createCheckoutSession({ user, items }) {
  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  if (!user?.id) {
    return { data: null, error: new Error('You need to sign in before checking out.') }
  }

  if (!items.length) {
    return { data: null, error: new Error('Add an item to your cart before checking out.') }
  }

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      userId: user.id,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    },
  })

  if (error) {
    return { data: null, error }
  }

  if (data?.error) {
    const validationError = new Error(data.error.message || 'We could not validate your cart.')
    validationError.code = data.error.code
    validationError.details = data.error.details
    return { data: null, error: validationError }
  }

  if (!data?.url || typeof data.url !== 'string') {
    return { data: null, error: new Error('We could not start checkout. Please try again.') }
  }

  return { data: { url: data.url }, error: null }
}
