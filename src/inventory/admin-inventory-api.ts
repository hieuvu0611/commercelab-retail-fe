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

const MOVEMENT_LIMIT = 100

/** GET /admin/inventory/stock answers one warehouse and has no paging: the rest is done here. */
async function stockOf(warehouse: string): Promise<InventoryRow[]> {
  const { data } = await storefrontApi.get<unknown[] | null>('/admin/inventory/stock', {
    params: { warehouse },
  })
  return (data ?? []).map((row) => toInventoryRow(row))
}

export async function listInventory(query: InventoryQuery) {
  const warehouses = query.warehouse ? [query.warehouse] : query.warehouses
  const needle = (query.q ?? '').trim().toLowerCase()
  const rows = (await Promise.all(warehouses.map(stockOf)))
    .flat()
    .filter((row) => !needle || row.skuId.toLowerCase().includes(needle))
    .sort((a, b) => a.skuId.localeCompare(b.skuId) || a.warehouseId.localeCompare(b.warehouseId))
  const start = (query.page - 1) * query.limit
  return {
    items: rows.slice(start, start + query.limit),
    total: rows.length,
    pageCount: Math.max(Math.ceil(rows.length / query.limit), 1),
  }
}

/** Newest first. */
export async function getMovements(skuId: string, warehouse: string): Promise<StockMovement[]> {
  const { data } = await storefrontApi.get<unknown[] | null>('/admin/inventory/movements', {
    params: { warehouse, skuId, limit: MOVEMENT_LIMIT },
  })
  return (data ?? []).map((movement) => toMovement(movement))
}

/** The service answers 201 with the recorded lines, not the new stock row. */
export async function postOpeningStock(input: OpeningStockInput): Promise<void> {
  await storefrontApi.post(
    '/admin/inventory/opening-stock',
    {
      warehouseId: input.warehouseId,
      reason: input.reason,
      lines: [{ skuId: input.skuId, quantity: input.qty }],
    },
    quiet
  )
}
