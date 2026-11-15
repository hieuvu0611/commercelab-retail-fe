import { seedProducts } from '@/catalog/mock-products'
import { WAREHOUSES } from '@/configs/roles'
import type { MockRequest, MockResponse } from '@/auth/mock-api'
import type {
  Availability,
  AvailabilityEntry,
  InventoryRow,
  MovementType,
  StockBuckets,
  StockMovement,
} from '@/types/inventory'
import { stateFromAvailable } from './availability'

/** Inventory part of the in-app mock backend (/mock-api). Mirrors the Phase 3 contract (see src/types/inventory.ts). */

const WAREHOUSE_MGR = 'WAREHOUSE_MGR'
const WAREHOUSE_STAFF = 'WAREHOUSE_STAFF'
const ALL_WAREHOUSES = 'ALL'
const MIN_REASON = 3
const MAX_REASON = 500
const MAX_OPENING_QTY = 1_000_000
const MAX_AVAILABILITY_SKUS = 100
const DEFAULT_LIMIT = 15
const MAX_LIMIT = 100
const SEED_AT = '2026-10-01T09:00:00.000Z'
const SEED_ACTOR = 'System seed'

export interface InventoryCaller {
  name: string
  roles: string[]
  warehouseScopes: string[]
}

export interface MockInventoryState {
  /** Buckets keyed by `${warehouseId}|${skuId}`. */
  buckets: Map<string, StockBuckets>
  /** Oldest first. */
  movements: StockMovement[]
  counter: number
}

const keyOf = (warehouseId: string, skuId: string) => `${warehouseId}|${skuId}`

const withAvailable = (
  onHand: number,
  unsellable: number,
  reserved: number,
  committed: number
): StockBuckets => ({
  onHand,
  unsellable,
  reserved,
  committed,
  available: Math.max(onHand - unsellable - reserved - committed, 0),
})

/** Fixed buckets for SKUs the scenarios and the Chrome checks rely on: [HCM, HN] as [onHand, unsellable, reserved, committed]. */
const OVERRIDES: Record<
  string,
  [[number, number, number, number], [number, number, number, number]]
> = {
  // Business example: 100 on hand, 5 unsellable, 10 reserved, 15 committed gives 70 available.
  'BP-CITY-BLK-20L': [
    [100, 5, 10, 15],
    [30, 0, 0, 0],
  ],
  // Exactly 3 available in HCM and none in HN: shown as low stock.
  'CITY-BACKPACK-BLACK-25-L': [
    [5, 1, 0, 1],
    [0, 0, 0, 0],
  ],
  // Nothing sellable anywhere: shown as out of stock.
  'BTL-INS-BLK-500': [
    [12, 2, 4, 6],
    [0, 0, 0, 0],
  ],
}

const OUT_BUCKETS: [number, number, number, number] = [12, 2, 4, 6]
const LOW_BUCKETS: [number, number, number, number] = [9, 1, 2, 3]
const NONE: [number, number, number, number] = [0, 0, 0, 0]

type Pattern = 'MIXED' | 'ALL_OUT' | 'ALL_LOW'

/** Some whole products are out or low everywhere so list cards show every state. */
const productPattern = (productIndex: number): Pattern =>
  productIndex % 7 === 3 ? 'ALL_OUT' : productIndex % 7 === 5 ? 'ALL_LOW' : 'MIXED'

function seedBuckets(skuId: string, index: number, pattern: Pattern): [StockBuckets, StockBuckets] {
  const override = OVERRIDES[skuId]
  if (override) return [withAvailable(...override[0]), withAvailable(...override[1])]
  if (pattern === 'ALL_OUT') return [withAvailable(...OUT_BUCKETS), withAvailable(...NONE)]
  if (pattern === 'ALL_LOW') return [withAvailable(...LOW_BUCKETS), withAvailable(...NONE)]
  if (index % 9 === 4) return [withAvailable(...OUT_BUCKETS), withAvailable(...NONE)]
  if (index % 6 === 1) return [withAvailable(...LOW_BUCKETS), withAvailable(2, 0, 0, 0)]
  return [withAvailable(40 + (index % 5) * 10, 2, (index % 4) + 1, 5), withAvailable(20, 0, 2, 1)]
}

export function createMockInventoryState(): MockInventoryState {
  const state: MockInventoryState = { buckets: new Map(), movements: [], counter: 0 }
  const skus = seedProducts().flatMap((product, productIndex) =>
    product.skus.map((sku) => ({ skuId: sku.skuId, pattern: productPattern(productIndex) }))
  )
  skus.forEach(({ skuId, pattern }, index) => {
    const perWarehouse = seedBuckets(skuId, index, pattern)
    WAREHOUSES.forEach((warehouseId, position) => {
      const buckets = perWarehouse[position]
      state.buckets.set(keyOf(warehouseId, skuId), buckets)
      if (buckets.onHand > 0)
        record(
          state,
          skuId,
          warehouseId,
          'OPENING',
          buckets.onHand,
          SEED_ACTOR,
          'Opening count',
          SEED_AT
        )
    })
  })
  // A short, believable history for the business example.
  const first = 'BP-CITY-BLK-20L'
  record(
    state,
    first,
    WAREHOUSES[0],
    'RESERVE',
    10,
    SEED_ACTOR,
    'Order reservation',
    '2026-10-02T03:00:00.000Z'
  )
  record(
    state,
    first,
    WAREHOUSES[0],
    'COMMIT',
    15,
    SEED_ACTOR,
    'Order paid',
    '2026-10-02T04:00:00.000Z'
  )
  return state
}

function record(
  state: MockInventoryState,
  skuId: string,
  warehouseId: string,
  type: MovementType,
  qty: number,
  actor: string,
  reason: string,
  at: string = new Date().toISOString()
): StockMovement {
  state.counter += 1
  const movement: StockMovement = {
    id: `mov-${state.counter}`,
    skuId,
    warehouseId,
    type,
    qty,
    actor,
    reason,
    at,
  }
  state.movements = [...state.movements, movement]
  return movement
}

const globalForInventory = globalThis as unknown as { __mockInventoryState?: MockInventoryState }

export function getMockInventoryState(): MockInventoryState {
  globalForInventory.__mockInventoryState ??= createMockInventoryState()
  return globalForInventory.__mockInventoryState
}

/** Units for sale of a SKU across every warehouse, or in one warehouse. */
function availableOf(state: MockInventoryState, skuId: string, warehouseId?: string): number {
  return (warehouseId ? [warehouseId] : [...WAREHOUSES]).reduce(
    (total, id) => total + (state.buckets.get(keyOf(id, skuId))?.available ?? 0),
    0
  )
}

/** Stock state of one SKU (OUT when the SKU has no stock record at all). */
export function skuAvailability(
  state: MockInventoryState,
  skuId: string,
  warehouseId?: string
): AvailabilityEntry['state'] {
  return stateFromAvailable(availableOf(state, skuId, warehouseId))
}

/** One state for several SKUs (any sellable SKU makes the product sellable). */
export function productAvailability(state: MockInventoryState, skuIds: string[]): Availability {
  const states = skuIds.map((skuId) => skuAvailability(state, skuId))
  if (states.includes('IN_STOCK')) return 'IN_STOCK'
  if (states.includes('LOW')) return 'LOW'
  return states.length > 0 ? 'OUT' : 'unknown'
}

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({ status, body: { message, code, status, ...(errors && { errors }) } })

const invalid = (errors: Record<string, string[]>): MockResponse =>
  failure(422, 'VALIDATION_FAILED', 'Request validation failed', errors)

const forbidden = (): MockResponse =>
  failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

const outOfScope = (): MockResponse =>
  failure(403, 'WAREHOUSE_FORBIDDEN', 'This warehouse is outside your scope')

function scopeOf(caller: InventoryCaller): string[] {
  return caller.warehouseScopes.includes(ALL_WAREHOUSES)
    ? [...WAREHOUSES]
    : WAREHOUSES.filter((id) => caller.warehouseScopes.includes(id))
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = Math.trunc(Number(value))
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

function rowsOf(state: MockInventoryState, warehouses: string[], needle: string): InventoryRow[] {
  const names = new Map(
    seedProducts().flatMap((product) =>
      product.skus.map(
        (sku) => [sku.skuId, { productName: product.name, attributes: sku.attributes }] as const
      )
    )
  )
  return [...state.buckets.entries()]
    .map(([key, buckets]): InventoryRow => {
      const [warehouseId, skuId] = key.split('|')
      return {
        skuId,
        productName: names.get(skuId)?.productName ?? skuId,
        attributes: names.get(skuId)?.attributes ?? {},
        warehouseId,
        ...buckets,
      }
    })
    .filter(
      (row) =>
        warehouses.includes(row.warehouseId) &&
        (!needle || `${row.skuId} ${row.productName}`.toLowerCase().includes(needle))
    )
    .sort((a, b) => a.skuId.localeCompare(b.skuId) || a.warehouseId.localeCompare(b.warehouseId))
}

function openingStock(
  state: MockInventoryState,
  caller: InventoryCaller,
  body: Record<string, unknown>
): MockResponse {
  const skuId = typeof body.skuId === 'string' ? body.skuId.trim() : ''
  const warehouseId = typeof body.warehouseId === 'string' ? body.warehouseId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const errors: Record<string, string[]> = {}

  if (!warehouseId) errors.warehouseId = ['Choose a warehouse']
  else if (!WAREHOUSES.includes(warehouseId)) errors.warehouseId = ['Unknown warehouse']
  else if (!scopeOf(caller).includes(warehouseId)) return outOfScope()

  if (!skuId) errors.skuId = ['Enter a SKU']
  else if (
    !state.buckets.has(keyOf(WAREHOUSES[0], skuId)) &&
    !state.buckets.has(keyOf(WAREHOUSES[1], skuId))
  )
    errors.skuId = ['This SKU does not exist']

  const qty = body.qty
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_OPENING_QTY)
    errors.qty = ['Quantity must be a whole number from 1 to 1,000,000']
  if (reason.length < MIN_REASON || reason.length > MAX_REASON)
    errors.reason = ['Reason is required (3 to 500 characters)']
  if (Object.keys(errors).length > 0) return invalid(errors)

  const key = keyOf(warehouseId, skuId)
  const current = state.buckets.get(key) ?? withAvailable(0, 0, 0, 0)
  const next = withAvailable(
    current.onHand + (qty as number),
    current.unsellable,
    current.reserved,
    current.committed
  )
  state.buckets = new Map(state.buckets).set(key, next)
  record(state, skuId, warehouseId, 'OPENING', qty as number, caller.name, reason)
  const row = rowsOf(state, [warehouseId], skuId.toLowerCase()).find(
    (entry) => entry.skuId === skuId
  )
  return ok(row, 'Opening stock recorded', 201)
}

/** Returns a response for an inventory endpoint, or null when the request is not an inventory request. */
export function handleInventoryMock(
  request: MockRequest,
  caller: InventoryCaller | null,
  state: MockInventoryState = getMockInventoryState()
): MockResponse | null {
  const { method, path } = request
  const query = request.query ?? {}

  if (method === 'GET' && path === '/inventory/availability') {
    const skuIds = (query.skuIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (skuIds.length === 0 || skuIds.length > MAX_AVAILABILITY_SKUS)
      return invalid({ skuIds: ['Send 1 to 100 SKU ids separated by commas'] })
    if (query.warehouse && !WAREHOUSES.includes(query.warehouse))
      return invalid({ warehouse: ['Unknown warehouse'] })
    return ok(
      skuIds.map(
        (skuId): AvailabilityEntry => ({
          skuId,
          state: skuAvailability(state, skuId, query.warehouse || undefined),
        })
      )
    )
  }

  if (!path.startsWith('/admin/inventory')) return null
  if (!caller) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  const isManager = caller.roles.includes(WAREHOUSE_MGR)
  if (!isManager && !caller.roles.includes(WAREHOUSE_STAFF)) return forbidden()
  const scope = scopeOf(caller)
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}

  if (method === 'GET' && path === '/admin/inventory') {
    if (query.warehouse && !WAREHOUSES.includes(query.warehouse))
      return invalid({ warehouse: ['Unknown warehouse'] })
    if (query.warehouse && !scope.includes(query.warehouse)) return outOfScope()
    const rows = rowsOf(
      state,
      query.warehouse ? [query.warehouse] : scope,
      (query.q ?? '').trim().toLowerCase()
    )
    const limit = Math.min(Math.max(num(query.limit, DEFAULT_LIMIT), 1), MAX_LIMIT)
    const pageCount = Math.max(Math.ceil(rows.length / limit), 1)
    const page = Math.min(Math.max(num(query.page, 1), 1), pageCount)
    return {
      status: 200,
      body: {
        message: 'Inventory retrieved',
        data: rows.slice((page - 1) * limit, page * limit),
        metadata: { total: rows.length, page, pageCount, limit },
      },
    }
  }

  const history = path.match(/^\/admin\/inventory\/([^/]+)\/movements$/)
  if (method === 'GET' && history) {
    if (query.warehouse && !scope.includes(query.warehouse)) return outOfScope()
    const warehouses = query.warehouse ? [query.warehouse] : scope
    const skuId = decodeURIComponent(history[1])
    const movements = state.movements
      .filter((movement) => movement.skuId === skuId && warehouses.includes(movement.warehouseId))
      .sort(
        (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, undefined, { numeric: true })
      )
    return ok(movements)
  }

  if (method === 'POST' && path === '/admin/inventory/opening-stock') {
    return isManager ? openingStock(state, caller, body) : forbidden()
  }

  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
