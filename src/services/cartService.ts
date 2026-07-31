import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { Cart, CartInsert, CartUpdate } from '../types/index.js'

export const cartService = createTableService<Cart, CartInsert, CartUpdate>(DATABASE_TABLES.cart)

export const listCarts = cartService.list
export const getCartById = cartService.getById
export const createCart = cartService.create
export const updateCart = cartService.update
export const removeCart = cartService.remove
