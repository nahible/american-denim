import { PageHero } from '../components/index.js'

export function PaymentSuccessPage({ sessionId }) {
  return (
    <>
      <PageHero
        eyebrow="Payment received"
        title="Thanks for your order."
        description="Your payment was submitted successfully. We'll send your order details to the email you used at checkout."
        ctaLabel="View your orders"
        ctaHref="#orders"
        ctaSecondaryLabel="Keep shopping"
        ctaSecondaryHref="#shop"
      />

      {sessionId && (
        <section className="section" aria-label="Payment confirmation">
          <p className="catalog-results">Confirmation ID: {sessionId}</p>
        </section>
      )}
    </>
  )
}
