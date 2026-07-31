import { createTableService } from './databaseService.js'
import { DATABASE_TABLES } from '../constants/databaseTables.js'
import type { User, UserInsert, UserUpdate } from '../types/index.js'

export const usersService = createTableService<User, UserInsert, UserUpdate>(DATABASE_TABLES.users)

export const listUsers = usersService.list
export const getUserById = usersService.getById
export const createUser = usersService.create
export const updateUser = usersService.update
export const removeUser = usersService.remove
