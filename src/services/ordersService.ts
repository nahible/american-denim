import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { Order, OrderInsert, OrderUpdate } from '../types/index.js'

export const ordersService = createTableService<Order, OrderInsert, OrderUpdate>(DATABASE_TABLES.orders)

export const listOrders = ordersService.list
export const getOrderById = ordersService.getById
export const createOrder = ordersService.create
export const updateOrder = ordersService.update
export const removeOrder = ordersService.remove
