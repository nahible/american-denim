import { useState } from 'react'
import { Button } from './Button.jsx'
import { createCheckoutOrder } from '../services/checkoutService.js'

const EMPTY_ADDRESS = {
  fullName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'United States',
}

function formatError(error) {
  return error?.message || 'We could not submit your order. Please try again.'
}

function AddressFields({ address, onChange, legend }) {
  return (
    <fieldset className="checkout__fieldset">
      <legend>{legend}</legend>
      <label>
        Full name
        <input value={address.fullName} onChange={(event) => onChange('fullName', event.target.value)} type="text" required />
      </label>
      <label>
        Address line 1
        <input value={address.addressLine1} onChange={(event) => onChange('addressLine1', event.target.value)} type="text" required />
      </label>
      <label>
        Address line 2 <small>(optional)</small>
        <input value={address.addressLine2} onChange={(event) => onChange('addressLine2', event.target.value)} type="text" />
      </label>
      <div className="checkout__address-row">
        <label>
          City
          <input value={address.city} onChange={(event) => onChange('city', event.target.value)} type="text" required />
        </label>
        <label>
          State
          <input value={address.state} onChange={(event) => onChange('state', event.target.value)} type="text" required />
        </label>
      </div>
      <div className="checkout__address-row">
        <label>
          ZIP / Postal code
          <input value={address.postalCode} onChange={(event) => onChange('postalCode', event.target.value)} type="text" required />
        </label>
        <label>
          Country
          <input value={address.country} onChange={(event) => onChange('country', event.target.value)} type="text" required />
        </label>
      </div>
    </fieldset>
  )
}

export function CheckoutForm({ user, items, clearCart, onOrderSubmitted, onValidationError }) {
  const [contact, setContact] = useState({ email: user?.email ?? '', phone: '' })
  const [shippingAddress, setShippingAddress] = useState(EMPTY_ADDRESS)
  const [billingAddress, setBillingAddress] = useState(EMPTY_ADDRESS)
  const [billingMatchesShipping, setBillingMatchesShipping] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const updateAddress = (setter) => (field, value) => {
    setter((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await createCheckoutOrder({
        user,
        items,
        contact,
        shippingAddress,
        billingAddress: billingMatchesShipping ? shippingAddress : billingAddress,
      })

      if (response.error) {
        onValidationError?.(response.error.details)
        setError(formatError(response.error))
        return
      }

      onOrderSubmitted(response.data)
      clearCart()
    } catch (submitError) {
      setError(formatError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="checkout" onSubmit={handleSubmit} aria-busy={submitting}>
      <fieldset className="checkout__fieldset">
        <legend>Contact information</legend>
        <label>
          Email address
          <input value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} type="email" required />
        </label>
        <label>
          Phone <small>(optional)</small>
          <input value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} type="tel" />
        </label>
      </fieldset>

      <AddressFields address={shippingAddress} onChange={updateAddress(setShippingAddress)} legend="Shipping address" />

      <label className="checkout__checkbox">
        <input type="checkbox" checked={billingMatchesShipping} onChange={(event) => setBillingMatchesShipping(event.target.checked)} />
        Billing address is the same as shipping
      </label>

      {!billingMatchesShipping && (
        <AddressFields address={billingAddress} onChange={updateAddress(setBillingAddress)} legend="Billing address" />
      )}

      <div className="checkout__payment" aria-label="Order request information">
        <span className="eyebrow">Order request</span>
        <p>We will review these details and follow up with next steps before fulfillment.</p>
      </div>

      {error && <p className="cart__sync-error" role="alert">{error}</p>}
      <Button as="button" type="submit" variant="checkout" disabled={submitting}>
        {submitting ? 'Submitting order...' : 'Submit order request'}
      </Button>
    </form>
  )
}
