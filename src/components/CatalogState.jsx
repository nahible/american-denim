import { Button } from './Button.jsx'

export function CatalogState({ eyebrow, title, description, actionLabel, onAction }) {
  return (
    <div className="catalog-state" role="status" aria-live="polite">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction && (
        <Button as="button" type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
