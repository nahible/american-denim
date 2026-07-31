import { lookbookShoots } from '../constants/index.js'
import { LookbookCard, PageHero, SectionHeading } from '../components/index.js'
import { STORAGE_BUCKETS } from '../services/storageService.js'
import { useStorageAssets } from '../hooks/useStorageAssets.js'

export function LookbookPage() {
  const { assets } = useStorageAssets(STORAGE_BUCKETS.lookbook)

  return (
    <>
      <PageHero
        eyebrow="Lookbook"
        title="Photo shoots from the road"
        description="Editorial frames, field light, and the clothes as they actually live in the world."
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel="Read the story"
        ctaSecondaryHref="#story"
      />

      <section className="section lookbook">
        <SectionHeading
          title="Lookbook"
          description="Photo shoots, roadside frames, and the clothes as they actually live in the world."
        />

        <div className="grid">
          {lookbookShoots.map((item, index) => (
            <LookbookCard
              key={item.title}
              title={item.title}
              location={item.location}
              note={item.note}
              imageUrl={assets[index]}
            />
          ))}
        </div>
      </section>
    </>
  )
}
