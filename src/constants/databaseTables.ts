export const DATABASE_TABLES = {
  users: 'users',
  products: 'products',
  productImages: 'product_images',
  productVariants: 'product_variants',
  cart: 'cart',
  orders: 'orders',
  orderItems: 'order_items',
} as const

export type DatabaseTableName = (typeof DATABASE_TABLES)[keyof typeof DATABASE_TABLES]
