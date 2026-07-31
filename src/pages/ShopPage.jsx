import { PageHero } from '../components/index.js'
import { HomePage } from './HomePage.jsx'

export function ShopPage() {
  return (
    <>
      <PageHero
        eyebrow="Shop / New Drops"
        title="Pieces made to be lived in."
        description="Browse the latest small-batch essentials, then filter the drop by category, price, or order."
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel="Read the story"
        ctaSecondaryHref="#about"
      />
      <HomePage catalogOnly />
    </>
  )
}
