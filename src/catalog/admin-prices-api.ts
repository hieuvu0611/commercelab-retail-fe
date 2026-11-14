import { storefrontApi } from '@/services/api/clients'
import type { PriceEntry, SkuPriceRow } from '@/types/catalog'

// Backoffice price calls (MARKETING). The list and history endpoints are assumed (not in the P2-T06 list); see P2-T17.
const quiet = { skipUnauthorizedHandler: true } as const

export async function listSkuPrices(query: { q: string; page: number; limit: number }) {
  const { data, metadata } = await storefrontApi.get<SkuPriceRow[]>('/admin/prices', {
    params: { ...(query.q && { q: query.q }), page: query.page, limit: query.limit },
  })
  return { items: data, total: metadata?.total ?? data.length, pageCount: metadata?.pageCount ?? 1 }
}

export const setSkuPrice = async (
  skuId: string,
  input: { unitPriceVnd: number; effectiveFrom: string }
) =>
  (
    await storefrontApi.put<SkuPriceRow>(
      `/admin/skus/${encodeURIComponent(skuId)}/price`,
      input,
      quiet
    )
  ).data

export const getPriceHistory = async (skuId: string) =>
  (await storefrontApi.get<PriceEntry[]>(`/admin/skus/${encodeURIComponent(skuId)}/price-history`))
    .data
