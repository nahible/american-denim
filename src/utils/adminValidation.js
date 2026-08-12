export const FULFILLMENT_TRANSITIONS = {
  unfulfilled: ['processing', 'canceled'],
  processing: ['shipped', 'canceled'],
  shipped: ['delivered'],
  delivered: [],
  canceled: [],
}

export function adminAccessState({ authLoading, roleLoading, user, isAdmin }) {
  if (authLoading || roleLoading) return 'loading'
  if (!user) return 'unauthenticated'
  return isAdmin ? 'authorized' : 'unauthorized'
}

export function canTransitionFulfillment(from, to) {
  return from === to || Boolean(FULFILLMENT_TRANSITIONS[from]?.includes(to))
}

export function inventoryAfterAdjustment(current, type, quantity) {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(quantity) || quantity < 0) return null
  if (type === 'add') return current + quantity
  if (type === 'remove') return current - quantity >= 0 ? current - quantity : null
  if (type === 'set') return quantity
  return null
}

export function validateProductForm(values) {
  const errors = {}
  if (!String(values.name || '').trim()) errors.name = 'Product name is required.'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(values.slug || ''))) errors.slug = 'Use lowercase letters, numbers, and hyphens.'
  if (!['active', 'inactive'].includes(values.status)) errors.status = 'Choose a valid status.'
  return errors
}

export function validateRefundAmount(amountCents, totalCents, alreadyRefundedCents = 0) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return 'Enter a positive refund amount.'
  if (amountCents > totalCents - alreadyRefundedCents) return 'Refund exceeds the remaining refundable amount.'
  return null
}

export function validateDiscount(values) {
  const code = String(values.code || '').trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) return 'Use a 3–32 character code.'
  if (values.discountType === 'percentage') {
    const value = Number(values.value)
    if (!Number.isFinite(value) || value <= 0 || value > 100) return 'Percentage must be between 0 and 100.'
  } else if (values.discountType === 'fixed_amount') {
    const cents = Math.round(Number(values.value) * 100)
    if (!Number.isSafeInteger(cents) || cents <= 0) return 'Fixed discount must be positive.'
  } else return 'Choose a discount type.'
  return null
}
