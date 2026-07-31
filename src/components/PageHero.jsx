import { Button } from './Button.jsx'

export function PageHero({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  ctaSecondaryLabel,
  ctaSecondaryHref,
}) {
  return (
    <section className="page-hero">
      <div className="page-hero__content">
        <span className="hero__tag">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {(ctaLabel || ctaSecondaryLabel) && (
        <div className="page-hero__actions">
          {ctaLabel && (
            <Button as="a" href={ctaHref}>
              {ctaLabel}
            </Button>
          )}
          {ctaSecondaryLabel && (
            <a className="text-link" href={ctaSecondaryHref}>
              {ctaSecondaryLabel}
            </a>
          )}
        </div>
      )}
    </section>
  )
}
