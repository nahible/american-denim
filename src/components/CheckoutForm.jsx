import { Button } from './Button.jsx'
import { useState } from 'react'
import { createCheckoutSession } from '../services/checkoutService.js'

function formatError(error) {
  return error?.message || 'We could not start checkout. Please try again.'
}

export function CheckoutForm({ user, items, onValidationError }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await createCheckoutSession({ user, items })

      if (response.error) {
        onValidationError?.(response.error.details)
        setError(formatError(response.error))
        return
      }

      window.location.assign(response.data.url)
    } catch (submitError) {
      setError(formatError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="checkout" onSubmit={handleSubmit} aria-busy={submitting}>
      <div className="checkout__payment" aria-label="Secure checkout information">
        <span className="eyebrow">Secure checkout</span>
        <p>Card payment, email, and shipping details are collected securely by Stripe.</p>
      </div>

      {error && <p className="cart__sync-error" role="alert">{error}</p>}
      <Button as="button" type="submit" variant="checkout" disabled={submitting}>
        {submitting ? 'Redirecting to Stripe...' : 'Continue to secure payment'}
      </Button>
    </form>
  )
}
