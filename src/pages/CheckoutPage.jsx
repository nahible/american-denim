import { useEffect } from 'react'
import { CatalogState, CheckoutForm, PageHero, SectionHeading } from '../components/index.js'
import { useAuth } from '../hooks/useAuth.js'
import { useCart } from '../hooks/useCart.js'
import { formatPrice } from '../services/productTransforms.js'
import { rememberAuthRedirect } from '../utils/authRedirect.js'

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth()
  const { items, subtotal, loading, reconcileItems } = useCart()

  useEffect(() => {
    if (!authLoading && !user) {
      rememberAuthRedirect('#checkout')
      window.location.hash = '#login'
    }
  }, [authLoading, user])

  if (authLoading || !user) {
    return (
      <>
        <PageHero
          eyebrow="Checkout"
          title="Sign in to continue."
          description="Your checkout details are available after you sign in to your account."
          ctaLabel="Go to login"
          ctaHref="#login"
          ctaSecondaryLabel="Back to cart"
          ctaSecondaryHref="#cart"
        />
        <section className="section">
          <p className="catalog-results" role="status">Redirecting you to login...</p>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Checkout"
        title="Secure payment, ready when you are."
        description="Review your order, then complete card payment and shipping details securely with Stripe."
        ctaLabel="Back to cart"
        ctaHref="#cart"
        ctaSecondaryLabel="Keep shopping"
        ctaSecondaryHref="#shop"
      />

      <section className="section cart">
        <SectionHeading title="Checkout" description="Review your order, then continue to Stripe for secure payment and shipping details." />
        {loading ? (
          <p className="catalog-results" role="status">Loading your cart...</p>
        ) : items.length === 0 ? (
          <CatalogState
            eyebrow="Checkout"
            title="Your cart is empty."
            description="Choose a piece from the latest drop before continuing to checkout."
            actionLabel="Shop the drop"
            onAction={() => { window.location.hash = '#shop' }}
          />
        ) : (
          <div className="cart__layout">
            <div className="cart__summary">
              <span className="eyebrow">Order summary</span>
              <h3>Ready when you are.</h3>
              <div className="cart__totals">
                {items.map((item) => (
                  <div key={item.id}>
                    <span>{item.name} × {item.quantity}</span>
                    <strong>{formatPrice(item.price * item.quantity, item.currency)}</strong>
                  </div>
                ))}
                <div>
                  <span>Total</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
              </div>
            </div>
            <div className="cart__summary">
              <CheckoutForm
                user={user}
                items={items}
                onValidationError={reconcileItems}
              />
            </div>
          </div>
        )}
      </section>
    </>
  )
}
