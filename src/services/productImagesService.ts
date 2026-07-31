import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { ProductImage, ProductImageInsert, ProductImageUpdate } from '../types/index.js'

export const productImagesService = createTableService<ProductImage, ProductImageInsert, ProductImageUpdate>(
  DATABASE_TABLES.productImages,
)

export const listProductImages = productImagesService.list
export const getProductImageById = productImagesService.getById
export const createProductImage = productImagesService.create
export const updateProductImage = productImagesService.update
export const removeProductImage = productImagesService.remove
