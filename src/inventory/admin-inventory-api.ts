import { storefrontApi } from '@/services/api/clients'
import type {
  InventoryQuery,
  InventoryRow,
  OpeningStockInput,
  StockMovement,
} from '@/types/inventory'
import { toInventoryRow, toMovement } from './adapters'

// Backoffice inventory calls (WAREHOUSE_MGR, WAREHOUSE_STAFF). Mutations skip the global 401 sign-out so a form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const

export async function listInventory(query: InventoryQuery) {
  const { data, metadata } = await storefrontApi.get<unknown[]>('/admin/inventory', {
    params: {
      ...(query.warehouse && { warehouse: query.warehouse }),
      ...(query.q && { q: query.q }),
      page: query.page,
      limit: query.limit,
    },
  })
  const items = (data ?? []).map((row) => toInventoryRow(row))
  return {
    items,
    total: metadata?.total ?? items.length,
    pageCount: metadata?.pageCount ?? 1,
  }
}

export async function getMovements(skuId: string, warehouse?: string): Promise<StockMovement[]> {
  const { data } = await storefrontApi.get<unknown[]>(
    `/admin/inventory/${encodeURIComponent(skuId)}/movements`,
    { params: warehouse ? { warehouse } : undefined }
  )
  return (data ?? []).map((movement) => toMovement(movement))
}

export async function postOpeningStock(input: OpeningStockInput): Promise<InventoryRow> {
  const { data } = await storefrontApi.post<unknown>('/admin/inventory/opening-stock', input, quiet)
  return toInventoryRow(data)
}
