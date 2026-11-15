// Inventory API types (Phase 3). Everything the screens know about the inventory contract lives here so it can
// be reconciled against the real service in one place.

/** What the storefront may know about a SKU (decision D-12: never exact counts). */
export type StockState = 'IN_STOCK' | 'LOW' | 'OUT'

/** A stock state, or "unknown" when the availability lookup failed or timed out. */
export type Availability = StockState | 'unknown'

/** Available quantity at or below which a SKU counts as low on stock (service default, configurable there). */
export const LOW_STOCK_THRESHOLD = 3

/** Entry of GET /inventory/availability?skuIds=a,b&warehouse=WH-HCM-01 (public); it sits in data.items. */
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

/** Row of GET /admin/inventory/stock?warehouse= (WAREHOUSE_MGR, WAREHOUSE_STAFF; one warehouse per call). */
export interface InventoryRow extends StockBuckets {
  skuId: string
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

/** Entry of GET /admin/inventory/movements?warehouse=&skuId=: who changed which stock, why and when (I06). */
export interface StockMovement {
  id: string
  skuId: string
  warehouseId: string
  type: MovementType
  /** Units moved; positive for every type of the first slice. */
  qty: number
  /** Id of the person (or "system"/"seed") that caused the movement (the service sends actorId, no name). */
  actor: string
  reason: string
  /** ISO timestamp. */
  at: string
}

/** What the opening stock form collects; postOpeningStock sends it as {warehouseId, reason, lines:[{skuId, quantity}]}. */
export interface OpeningStockInput {
  skuId: string
  warehouseId: string
  qty: number
  reason: string
}

/**
 * Query of the stock list. The service answers one warehouse per call, so "all" means every warehouse in
 * `warehouses`; search and paging happen here.
 */
export interface InventoryQuery {
  warehouse?: string
  warehouses: string[]
  q?: string
  page: number
  limit: number
}
