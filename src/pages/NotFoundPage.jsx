import { CatalogState } from '../components/index.js'

export function NotFoundPage() {
  return (
    <section className="section">
      <CatalogState
        eyebrow="404 / Not found"
        title="That page took the back road."
        description="The address you followed does not point to a page in the storefront."
        actionLabel="Back to home"
        onAction={() => { window.location.hash = '' }}
      />
    </section>
  )
}
