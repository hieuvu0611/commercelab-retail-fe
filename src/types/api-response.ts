type Metadata = {
  total: number
  page: number
  pageCount: number
  limit: number
  searchEngine?: string
  facets?: Record<string, unknown>
}

export type ApiResponse<T> = {
  message?: string
  data: T
  metadata?: Metadata
}
