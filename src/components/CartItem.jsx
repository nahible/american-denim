import { formatPrice } from '../services/productTransforms.js'
import { memo } from 'react'

export const CartItem = memo(function CartItem({ item, onQuantityChange, onRemove }) {
  const lineTotal = item.price * item.quantity

  return (
    <article className="cart__item">
      <div>
        <h3>{item.name}</h3>
        <p>{item.detail}</p>
        <div className="cart__item-controls">
          <div className="cart__quantity" role="group" aria-label={`Quantity for ${item.name}`}>
            <button
              type="button"
              onClick={() => onQuantityChange(item.id, item.quantity - 1)}
              aria-label={`Decrease quantity for ${item.name}`}
            >
              -
            </button>
            <span aria-live="polite">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onQuantityChange(item.id, item.quantity + 1)}
              aria-label={`Increase quantity for ${item.name}`}
              disabled={item.stockQuantity !== null && item.stockQuantity !== undefined && item.quantity >= item.stockQuantity}
            >
              +
            </button>
          </div>
          <button type="button" className="cart__remove" onClick={() => onRemove(item.id)}>
            Remove
          </button>
        </div>
      </div>
      <div className="cart__item-price">
        <span>{formatPrice(lineTotal, item.currency)}</span>
        <small>{formatPrice(item.price, item.currency)} each</small>
      </div>
    </article>
  )
})
