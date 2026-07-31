import { supabase } from '../lib/supabase.js'

function configurationError() {
  return new Error('Supabase is not configured.')
}

function addressMetadata(address) {
  return {
    full_name: address.fullName.trim(),
    address_line_1: address.addressLine1.trim(),
    address_line_2: address.addressLine2.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    postal_code: address.postalCode.trim(),
    country: address.country.trim(),
  }
}

export async function createCheckoutOrder({ user, items, contact, shippingAddress, billingAddress }) {
  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  if (!user?.id) {
    return { data: null, error: new Error('You need to sign in before submitting an order.') }
  }

  if (!items.length) {
    return { data: null, error: new Error('Add an item to your cart before submitting an order.') }
  }

  const { data, error } = await supabase.functions.invoke('create-order', {
    body: {
      userId: user.id,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      contact: {
        email: contact.email.trim(),
        phone: contact.phone.trim(),
      },
      shippingAddress: addressMetadata(shippingAddress),
      billingAddress: addressMetadata(billingAddress),
    },
  })

  if (error) {
    return { data: null, error }
  }

  if (data?.error) {
    const validationError = new Error(data.error.message || 'We could not validate your order.')
    validationError.code = data.error.code
    validationError.details = data.error.details
    return { data: null, error: validationError }
  }

  return { data: data?.order ?? null, error: null }
}
