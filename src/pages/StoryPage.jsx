import { brandStory, plates } from '../constants/index.js'
import { PageHero } from '../components/index.js'

export function StoryPage({ aboutPage = false }) {
  return (
    <>
      <PageHero
        eyebrow={aboutPage ? 'About the brand' : 'Brand / Drop'}
        title={aboutPage ? 'Built for the long way around.' : 'The story behind americandrm'}
        description="A small-batch label built from lived-in basics, rough edges, and the kind of clothes that make sense after they&apos;ve already been worn a while."
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel={aboutPage ? 'Get in touch' : 'Jump to lookbook'}
        ctaSecondaryHref={aboutPage ? '#contact' : '#lookbook'}
      />

      <section className="story">
        <div className="about">
          <div className="about__text">
            <span className="eyebrow">{brandStory.eyebrow}</span>
            <h2>{brandStory.title}</h2>
            {brandStory.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="about__photo" aria-hidden="true" />
        </div>

        <section className="plates" aria-label="Brand pillars">
          {plates.map((plate) => (
            <div key={plate.title} className="plate">
              <b>{plate.title}</b>
              <span>{plate.text}</span>
            </div>
          ))}
        </section>
      </section>
    </>
  )
}
