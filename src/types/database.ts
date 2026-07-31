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
