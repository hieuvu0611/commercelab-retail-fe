import { PRODUCT_SORTS, type ProductListParams, type ProductSort } from '@/types/catalog'

export const PRODUCTS_PER_PAGE = 12
const ATTR_PREFIX = 'attr.'
const DEFAULT_SORT: ProductSort = 'newest'

type SearchParamsLike = Pick<URLSearchParams, 'get' | 'entries'>

function positiveInt(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return parsed > 0 ? parsed : undefined
}

/** Reads the listing state (filters, sort, page) from the URL; invalid values are ignored. */
export function parseListState(params: SearchParamsLike): ProductListParams {
  const attrs: Record<string, string[]> = {}
  for (const [key, value] of params.entries()) {
    if (!key.startsWith(ATTR_PREFIX) || !value) continue
    attrs[key.slice(ATTR_PREFIX.length)] = value.split(',').filter(Boolean)
  }
  const sort = params.get('sort')
  const minPrice = positiveInt(params.get('minPrice'))
  const maxPrice = positiveInt(params.get('maxPrice'))
  return {
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    attrs,
    sort: PRODUCT_SORTS.find((candidate) => candidate === sort) ?? DEFAULT_SORT,
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Serialises the listing state for the URL, leaving out defaults so shared links stay short. */
export function listStateToSearch(state: ProductListParams, q?: string): URLSearchParams {
  const search = new URLSearchParams()
  if (q) search.set('q', q)
  if (state.minPrice) search.set('minPrice', String(state.minPrice))
  if (state.maxPrice) search.set('maxPrice', String(state.maxPrice))
  for (const [axis, values] of Object.entries(state.attrs ?? {})) {
    if (values.length > 0) search.set(`${ATTR_PREFIX}${axis}`, values.join(','))
  }
  if (state.sort && state.sort !== DEFAULT_SORT) search.set('sort', state.sort)
  if (state.page && state.page > 1) search.set('page', String(state.page))
  return search
}

/** Query string parameters of GET /products. */
export function toApiQuery(params: ProductListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  if (params.category) query.category = params.category
  if (params.q) query.q = params.q
  if (params.minPrice) query.minPrice = params.minPrice
  if (params.maxPrice) query.maxPrice = params.maxPrice
  for (const [axis, values] of Object.entries(params.attrs ?? {})) {
    if (values.length > 0) query[`${ATTR_PREFIX}${axis}`] = values.join(',')
  }
  if (params.sort) query.sort = params.sort
  if (params.page) query.page = params.page
  if (params.limit) query.limit = params.limit
  return query
}
