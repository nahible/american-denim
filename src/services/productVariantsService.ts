import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { ProductVariant, ProductVariantInsert, ProductVariantUpdate } from '../types/index.js'

export const productVariantsService = createTableService<ProductVariant, ProductVariantInsert, ProductVariantUpdate>(
  DATABASE_TABLES.productVariants,
)

export const listProductVariants = productVariantsService.list
export const getProductVariantById = productVariantsService.getById
export const createProductVariant = productVariantsService.create
export const updateProductVariant = productVariantsService.update
export const removeProductVariant = productVariantsService.remove
