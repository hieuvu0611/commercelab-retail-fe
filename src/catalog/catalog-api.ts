import { storefrontApi } from '@/services/api/clients'
import type { ProductListItem, ProductListParams } from '@/types/catalog'
import { priceFilterToApi } from './money'
import { toApiQuery } from './list-query'

export interface ProductPage {
  items: ProductListItem[]
  total: number
  pageCount: number
}

/** GET /products. Price bounds in `params` are VAT-inclusive (what the customer sees). */
export async function fetchProductPage(params: ProductListParams): Promise<ProductPage> {
  const apiParams: ProductListParams = {
    ...params,
    ...(params.minPrice && { minPrice: priceFilterToApi(params.minPrice, 'min') }),
    ...(params.maxPrice && { maxPrice: priceFilterToApi(params.maxPrice, 'max') }),
  }
  const { data, metadata } = await storefrontApi.get<ProductListItem[]>('/products', {
    params: toApiQuery(apiParams),
  })
  return { items: data, total: metadata?.total ?? data.length, pageCount: metadata?.pageCount ?? 1 }
}
