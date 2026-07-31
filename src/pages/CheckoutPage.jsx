import { useEffect, useState } from 'react'
import { CatalogState, CheckoutForm, PageHero, SectionHeading } from '../components/index.js'
import { useAuth } from '../hooks/useAuth.js'
import { useCart } from '../hooks/useCart.js'
import { formatPrice } from '../services/productTransforms.js'
import { rememberAuthRedirect } from '../utils/authRedirect.js'

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth()
  const { items, subtotal, loading, clearCart, reconcileItems } = useCart()
  const [submittedOrder, setSubmittedOrder] = useState(null)

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

  if (submittedOrder) {
    return (
      <>
        <PageHero
          eyebrow="Checkout / Order request"
          title="Your request is saved."
          description="We have your order details and will follow up with next steps."
          ctaLabel="Continue shopping"
          ctaHref="#shop"
          ctaSecondaryLabel="View your orders"
          ctaSecondaryHref="#orders"
        />
        <section className="section">
          <CatalogState
            eyebrow="Order request"
            title={`Order ${submittedOrder.id.slice(0, 8)} is saved.`}
          description="Your details have been recorded. Our team will follow up with next steps before fulfillment."
            actionLabel="Back to shop"
            onAction={() => { window.location.hash = '#shop' }}
          />
        </section>
      </>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Checkout"
        title="Finish the details."
        description="Add your contact and delivery details to send an order request to our team."
        ctaLabel="Back to cart"
        ctaHref="#cart"
        ctaSecondaryLabel="Keep shopping"
        ctaSecondaryHref="#shop"
      />

      <section className="section cart">
        <SectionHeading title="Checkout" description="Review your order and send through the details we need to follow up." />
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
                clearCart={clearCart}
                onValidationError={reconcileItems}
                onOrderSubmitted={setSubmittedOrder}
              />
            </div>
          </div>
        )}
      </section>
    </>
  )
}
