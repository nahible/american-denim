export type EntityId = string
export type ISODateTime = string

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export interface JsonObject {
  [key: string]: JsonValue
}
export type JsonArray = JsonValue[]

export type TableStatus = string

export interface TableRowBase {
  id: EntityId
  created_at?: ISODateTime | null
  updated_at?: ISODateTime | null
}

export type InsertRow<T extends TableRowBase> = Omit<T, 'id' | 'created_at' | 'updated_at'>
export type UpdateRow<T extends TableRowBase> = Partial<InsertRow<T>>

export type FilterValue = string | number | boolean | null | Array<string | number | boolean>

export interface ListQueryOptions {
  select?: string
  filters?: Record<string, FilterValue>
  orderBy?: string
  ascending?: boolean
  limit?: number
  range?: {
    from: number
    to: number
  }
}

export interface SingleQueryOptions {
  select?: string
}

