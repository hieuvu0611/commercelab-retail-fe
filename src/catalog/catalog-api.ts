import { storefrontApi } from '@/services/api/clients'
import type { ProductListItem, ProductListParams } from '@/types/catalog'
import { toApiQuery } from './list-query'
import { toListItem } from './adapters'

export interface SearchFacetBucket {
  key: string
  count: number
}

export interface SearchFacets {
  brands?: SearchFacetBucket[]
  categories?: SearchFacetBucket[]
  minPriceVnd?: number
  maxPriceVnd?: number
}

export interface ProductPage {
  items: ProductListItem[]
  total: number
  pageCount: number
  searchEngine?: string
  facets?: SearchFacets
}

/** GET /products. Price bounds are passed through: stored prices already include VAT. */
export async function fetchProductPage(params: ProductListParams): Promise<ProductPage> {
  const { data, metadata } = await storefrontApi.get<ProductListItem[]>('/products', {
    params: toApiQuery(params),
  })
  return {
    items: data.map((item) => toListItem(item)),
    total: metadata?.total ?? data.length,
    pageCount: metadata?.pageCount ?? 1,
    ...(metadata?.searchEngine && { searchEngine: metadata.searchEngine }),
    ...(metadata?.facets && { facets: metadata.facets as SearchFacets }),
  }
}
