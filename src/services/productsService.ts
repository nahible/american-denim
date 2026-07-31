import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { Product, ProductInsert, ProductUpdate } from '../types/index.js'

export const productsService = createTableService<Product, ProductInsert, ProductUpdate>(DATABASE_TABLES.products)

export const listProducts = productsService.list
export const getProductById = productsService.getById
export const createProduct = productsService.create
export const updateProduct = productsService.update
export const removeProduct = productsService.remove
