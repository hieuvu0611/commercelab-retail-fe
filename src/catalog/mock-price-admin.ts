import type { PriceEntry, SkuPriceRow } from '@/types/catalog'
import type { MockCatalogState } from './mock-catalog'
import { CatalogError } from './mock-category-admin'

/** Price rules (P2-T06): integer VND, effective periods, history; the current price is the latest started one. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const SEED_PRICE_DATE = '2026-10-01'

export const today = (): string => new Date().toISOString().slice(0, 10)

const invalid = (field: string, message: string): never => {
  throw new CatalogError(422, 'VALIDATION_FAILED', { [field]: [message] })
}

function findSku(state: MockCatalogState, skuId: string) {
  for (const product of state.products) {
    const sku = product.skus.find((entry) => entry.skuId === skuId)
    if (sku) return { product, sku }
  }
  throw new CatalogError(404, 'NOT_FOUND')
}

/** Sorted history with effectiveTo filled in from the next entry. */
export function priceHistory(state: MockCatalogState, skuId: string): PriceEntry[] {
  const { sku } = findSku(state, skuId)
  const raw =
    state.prices[skuId] ??
    (sku.unitPriceVnd === null
      ? []
      : [{ unitPriceVnd: sku.unitPriceVnd, effectiveFrom: SEED_PRICE_DATE }])
  const sorted = [...raw].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return sorted.map((entry, index) => ({
    ...entry,
    effectiveTo: sorted[index + 1]?.effectiveFrom ?? null,
  }))
}

const currentOf = (history: PriceEntry[]): PriceEntry | undefined =>
  [...history].reverse().find((entry) => entry.effectiveFrom <= today())

export function setPrice(
  state: MockCatalogState,
  skuId: string,
  body: Record<string, unknown>
): SkuPriceRow {
  const { product } = findSku(state, skuId)
  const price = body.unitPriceVnd
  if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0)
    invalid('unitPriceVnd', 'Price must be a whole number of VND greater than zero')
  const from = body.effectiveFrom
  if (typeof from !== 'string' || !ISO_DATE.test(from) || Number.isNaN(Date.parse(from)))
    invalid('effectiveFrom', 'Choose a valid effective date')
  const effectiveFrom = from as string
  const before = priceHistory(state, skuId).filter((entry) => entry.effectiveFrom !== effectiveFrom)
  const next: PriceEntry[] = [
    ...before,
    { unitPriceVnd: price as number, effectiveFrom, effectiveTo: null },
  ]
  const current = currentOf(
    priceHistory({ ...state, prices: { ...state.prices, [skuId]: next } }, skuId)
  )
  state.prices = { ...state.prices, [skuId]: next }
  state.products = state.products.map((p) =>
    p.id !== product.id
      ? p
      : {
          ...p,
          skus: p.skus.map((sku) =>
            sku.skuId === skuId ? { ...sku, unitPriceVnd: current?.unitPriceVnd ?? null } : sku
          ),
        }
  )
  return listPrices(state, { q: skuId }).items.find((row) => row.skuId === skuId)!
}

export function listPrices(state: MockCatalogState, query: Record<string, string | undefined>) {
  const needle = (query.q ?? '').trim().toLowerCase()
  const rows: SkuPriceRow[] = state.products.flatMap((product) =>
    product.skus.map((sku) => ({
      skuId: sku.skuId,
      productId: product.id,
      productName: product.name,
      attributes: sku.attributes,
      unitPriceVnd: sku.unitPriceVnd,
      effectiveFrom: currentOf(priceHistory(state, sku.skuId))?.effectiveFrom ?? null,
    }))
  )
  const matching = rows.filter(
    (row) => !needle || `${row.skuId} ${row.productName}`.toLowerCase().includes(needle)
  )
  const limit = Math.min(Math.max(Number(query.limit) || 15, 1), 100)
  const pageCount = Math.max(Math.ceil(matching.length / limit), 1)
  const page = Math.min(Math.max(Number(query.page) || 1, 1), pageCount)
  return {
    items: matching.slice((page - 1) * limit, page * limit),
    total: matching.length,
    page,
    pageCount,
    limit,
  }
}
