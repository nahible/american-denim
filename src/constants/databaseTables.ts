export const DATABASE_TABLES = {
  users: 'users',
  products: 'products',
  productImages: 'product_images',
  productVariants: 'product_variants',
  cart: 'cart',
  orders: 'orders',
  orderItems: 'order_items',
  userRoles: 'user_roles',
  inventoryAdjustments: 'inventory_adjustments',
  refunds: 'refunds',
  discounts: 'discounts',
  adminAuditLog: 'admin_audit_log',
} as const

export type DatabaseTableName = (typeof DATABASE_TABLES)[keyof typeof DATABASE_TABLES]
