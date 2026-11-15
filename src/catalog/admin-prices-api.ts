import { storefrontApi } from '@/services/api/clients'
import type { PriceEntry, SkuPriceRow } from '@/types/catalog'
import { effectiveFromForApi, toPriceHistory, toPriceRow } from './adapters'

// Backoffice price calls (MARKETING).
const quiet = { skipUnauthorizedHandler: true } as const

export async function listSkuPrices(query: { q: string; page: number; limit: number }) {
  const { data, metadata } = await storefrontApi.get<SkuPriceRow[]>('/admin/prices', {
    params: { ...(query.q && { q: query.q }), page: query.page, limit: query.limit },
  })
  return {
    items: data.map((row) => toPriceRow(row)),
    total: metadata?.total ?? data.length,
    pageCount: metadata?.pageCount ?? 1,
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** Sets a price from `effectiveFrom` (a date; today or earlier means now). */
export async function setSkuPrice(
  skuId: string,
  input: { unitPriceVnd: number; effectiveFrom: string }
): Promise<void> {
  const effectiveFrom = effectiveFromForApi(input.effectiveFrom, todayIso())
  await storefrontApi.put<unknown>(
    `/admin/skus/${encodeURIComponent(skuId)}/price`,
    { unitPriceVnd: input.unitPriceVnd, ...(effectiveFrom && { effectiveFrom }) },
    quiet
  )
}

export const getPriceHistory = async (skuId: string): Promise<PriceEntry[]> =>
  toPriceHistory(
    (
      await storefrontApi.get<Record<string, unknown>>(
        `/admin/skus/${encodeURIComponent(skuId)}/price`
      )
    ).data
  )
