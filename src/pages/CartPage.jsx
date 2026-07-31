import { Button, CartItem, PageHero, SectionHeading } from '../components/index.js'
import { useCart } from '../hooks/useCart.js'
import { formatPrice } from '../services/productTransforms.js'

function CartLoadingSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">Loading your cart</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <article className="cart__item cart__item--skeleton" key={`cart-skeleton-${index}`} aria-hidden="true">
          <div className="cart-skeleton__copy">
            <span className="card__skeleton cart-skeleton__line--title" />
            <span className="card__skeleton cart-skeleton__line--detail" />
            <span className="card__skeleton cart-skeleton__line--controls" />
          </div>
          <span className="card__skeleton cart-skeleton__line--price" />
        </article>
      ))}
    </>
  )
}

export function CartPage() {
  const { items, subtotal, loading, syncError, updateQuantity, removeItem, clearCart } = useCart()
  const total = subtotal

  const hasItems = items.length > 0

  return (
    <>
      <PageHero
        eyebrow="Cart / Checkout"
        title="Review your order"
        description="Review your pieces, then continue when everything looks right."
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel="See the lookbook"
        ctaSecondaryHref="#lookbook"
      />

      <section className="section cart">
        <SectionHeading title="Cart" description="Review your pieces, adjust quantities, and continue to checkout when ready." />

        <div className="cart__layout">
          <div className="cart__items">
            {loading ? (
              <CartLoadingSkeleton />
            ) : hasItems ? (
              items.map((item) => (
                <CartItem key={item.id} item={item} onQuantityChange={updateQuantity} onRemove={removeItem} />
              ))
            ) : (
              <div className="cart__empty">
                <span className="eyebrow">Cart</span>
                <h3>Your cart is empty.</h3>
                <p>Find a piece from the latest drop and add it here.</p>
                <Button as="a" href="#shop" variant="plate">Shop the drop</Button>
              </div>
            )}
          </div>

          <aside className="cart__summary" aria-label="Order summary and checkout">
            <span className="eyebrow">Order summary</span>
            <h3>{hasItems ? 'Ready when you are.' : 'Build your order.'}</h3>
            <p>Review your pieces here, then continue to the checkout details.</p>

            <div className="cart__totals">
              <div>
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              <div>
                <span>Shipping</span>
                <strong>Calculated at checkout</strong>
              </div>
              <div>
                <span>Tax</span>
                <strong>Calculated at checkout</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>
            </div>

            {hasItems && !loading && (
              <Button as="a" href="#checkout" variant="checkout">Continue to checkout</Button>
            )}

            {hasItems && !loading && (
              <button type="button" className="cart__remove cart__clear" onClick={clearCart}>
                Clear cart
              </button>
            )}

            {syncError && <p className="cart__sync-error" role="alert">Your latest cart change could not be saved. Please try again.</p>}
          </aside>
        </div>
      </section>
    </>
  )
}
