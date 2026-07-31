import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { OrderItem, OrderItemInsert, OrderItemUpdate } from '../types/index.js'

export const orderItemsService = createTableService<OrderItem, OrderItemInsert, OrderItemUpdate>(
  DATABASE_TABLES.orderItems,
)

export const listOrderItems = orderItemsService.list
export const getOrderItemById = orderItemsService.getById
export const createOrderItem = orderItemsService.create
export const updateOrderItem = orderItemsService.update
export const removeOrderItem = orderItemsService.remove
