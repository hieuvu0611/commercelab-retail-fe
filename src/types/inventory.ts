// Inventory API types (Phase 3). Everything the screens know about the inventory contract lives here so it can
// be reconciled against the real service in one place.

/** What the storefront may know about a SKU (decision D-12: never exact counts). */
export type StockState = 'IN_STOCK' | 'LOW' | 'OUT'

/** A stock state, or "unknown" when the availability lookup failed or timed out. */
export type Availability = StockState | 'unknown'

/** Available quantity at or below which a SKU counts as low on stock (service default, configurable there). */
export const LOW_STOCK_THRESHOLD = 3

/** Entry of GET /inventory/availability?skuIds=a,b&warehouse=WH-HCM-01 (public). */
export interface AvailabilityEntry {
  skuId: string
  state: StockState
}

/** Stock buckets of one SKU in one warehouse. available = onHand - unsellable - reserved - committed, never negative. */
export interface StockBuckets {
  onHand: number
  unsellable: number
  reserved: number
  committed: number
  available: number
}

/** Row of GET /admin/inventory (WAREHOUSE_MGR, WAREHOUSE_STAFF; limited to the caller's warehouses). */
export interface InventoryRow extends StockBuckets {
  skuId: string
  productName: string
  attributes: Record<string, string>
  warehouseId: string
}

export const MOVEMENT_TYPES = [
  'OPENING',
  'RESERVE',
  'COMMIT',
  'RELEASE',
  'HANDOVER',
  'RETURN_RECEIVE',
  'QC_PASS',
  'ADJUST',
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

/** Entry of GET /admin/inventory/{skuId}/movements: who changed which stock, why and when (I06). */
export interface StockMovement {
  id: string
  skuId: string
  warehouseId: string
  type: MovementType
  /** Units moved; positive for every type of the first slice. */
  qty: number
  /** Name or id of the person (or system) that caused the movement. */
  actor: string
  reason: string
  /** ISO timestamp. */
  at: string
}

/** Body of POST /admin/inventory/opening-stock (WAREHOUSE_MGR, own warehouse only). */
export interface OpeningStockInput {
  skuId: string
  warehouseId: string
  qty: number
  reason: string
}

/** Query of GET /admin/inventory. */
export interface InventoryQuery {
  warehouse?: string
  q?: string
  page: number
  limit: number
}
