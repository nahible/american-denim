import type { InsertRow, ISODateTime, JsonObject, TableRowBase, TableStatus, UpdateRow } from './shared.js'

export interface User extends TableRowBase {
  email?: string | null
  full_name?: string | null
  role?: string | null
  status?: TableStatus | null
  metadata?: JsonObject | null
}

export type UserInsert = InsertRow<User>
export type UserUpdate = UpdateRow<User>

export interface Product extends TableRowBase {
  slug?: string | null
  name?: string | null
  description?: string | null
  status?: TableStatus | null
  featured?: boolean | null
  metadata?: JsonObject | null
}

export type ProductInsert = InsertRow<Product>
export type ProductUpdate = UpdateRow<Product>

export interface ProductImage extends TableRowBase {
  product_id: string
  url?: string | null
  alt_text?: string | null
  sort_order?: number | null
  metadata?: JsonObject | null
}

export type ProductImageInsert = InsertRow<ProductImage>
export type ProductImageUpdate = UpdateRow<ProductImage>

export interface ProductVariant extends TableRowBase {
  product_id: string
  sku?: string | null
  name?: string | null
  price?: number | null
  currency?: string | null
  compare_at_price?: number | null
  stock_quantity?: number | null
  low_stock_threshold?: number | null
  status?: 'active' | 'inactive' | null
  color?: string | null
  size?: string | null
  metadata?: JsonObject | null
}

export type ProductVariantInsert = InsertRow<ProductVariant>
export type ProductVariantUpdate = UpdateRow<ProductVariant>

export interface Cart extends TableRowBase {
  user_id?: string | null
  status?: TableStatus | null
  currency?: string | null
  metadata?: JsonObject | null
}

export type CartInsert = InsertRow<Cart>
export type CartUpdate = UpdateRow<Cart>

export interface Order extends TableRowBase {
  user_id?: string | null
  cart_id?: string | null
  status?: TableStatus | null
  payment_status?: 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed' | null
  fulfillment_status?: 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'canceled' | null
  carrier?: string | null
  tracking_number?: string | null
  processing_at?: ISODateTime | null
  shipped_at?: ISODateTime | null
  delivered_at?: ISODateTime | null
  canceled_at?: ISODateTime | null
  paid_at?: ISODateTime | null
  refunded_amount_cents?: number | null
  stripe_session_id?: string | null
  stripe_payment_intent?: string | null
  currency?: string | null
  subtotal?: number | null
  shipping_total?: number | null
  tax_total?: number | null
  discount_total?: number | null
  total?: number | null
  metadata?: JsonObject | null
}

export type OrderInsert = InsertRow<Order>
export type OrderUpdate = UpdateRow<Order>

export interface OrderItem extends TableRowBase {
  order_id: string
  product_id?: string | null
  variant_id?: string | null
  quantity: number
  unit_price?: number | null
  currency?: string | null
  metadata?: JsonObject | null
}

export type OrderItemInsert = InsertRow<OrderItem>
export type OrderItemUpdate = UpdateRow<OrderItem>

export interface UserRole {
  user_id: string
  role: 'customer' | 'admin'
  created_at?: ISODateTime | null
  updated_at?: ISODateTime | null
}

export interface Refund extends TableRowBase {
  order_id: string
  stripe_refund_id?: string | null
  amount_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'canceled'
  reason?: string | null
  restock_requested: boolean
  restocked_at?: ISODateTime | null
}

export interface Discount extends TableRowBase {
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  percent_off?: number | null
  amount_off_cents?: number | null
  active: boolean
  expires_at?: ISODateTime | null
  max_redemptions?: number | null
  minimum_order_cents?: number | null
  times_redeemed: number
}
