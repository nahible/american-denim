import { PageHero } from '../components/index.js'

export function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Questions, orders, or just a good story?"
        description="Reach the americandrm team directly. We are a small crew and we read every note."
        ctaLabel="Shop the drop"
        ctaHref="#shop"
        ctaSecondaryLabel="Read about us"
        ctaSecondaryHref="#about"
      />
      <section className="section contact">
        <div className="plates" aria-label="Contact options">
          <a className="plate" href="mailto:hello@americandrm.com">
            <b>General inquiries</b>
            <span>hello@americandrm.com</span>
          </a>
          <a className="plate" href="mailto:orders@americandrm.com">
            <b>Order support</b>
            <span>orders@americandrm.com</span>
          </a>
          <div className="plate">
            <b>Response time</b>
            <span>Usually within 1-2 days</span>
          </div>
        </div>
      </section>
    </>
  )
}
