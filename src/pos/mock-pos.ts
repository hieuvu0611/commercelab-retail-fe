import { WAREHOUSES } from '@/configs/roles'
import {
  PosApiError,
  type CreatePosSaleRequest,
  type PosCatalogItem,
  type PosSaleItem,
  type PosSaleReceipt,
  type PosSaleSummary,
} from './types'

interface MockSkuRecord {
  skuId: string
  name: string
  unitPriceVnd: number
  stockByWarehouse: Record<string, number>
}

interface MockPosState {
  catalog: Map<string, MockSkuRecord>
  sales: PosSaleSummary[]
  receiptsByKey: Map<string, PosSaleReceipt>
  sequence: number
}

const SEED_CATALOG: readonly MockSkuRecord[] = [
  {
    skuId: 'BP-CITY-BLK-20L',
    name: 'City Backpack 20L',
    unitPriceVnd: 300000,
    stockByWarehouse: { 'WH-HCM-01': 70, 'WH-HN-01': 30 },
  },
  {
    skuId: 'WB-THERMO-SLV-500',
    name: 'Thermo Bottle 500ml',
    unitPriceVnd: 100000,
    stockByWarehouse: { 'WH-HCM-01': 50, 'WH-HN-01': 25 },
  },
  {
    skuId: 'ACC-PACK-ORG-M',
    name: 'Packing Organizer M',
    unitPriceVnd: 180000,
    stockByWarehouse: { 'WH-HCM-01': 40, 'WH-HN-01': 15 },
  },
]

const SEED_SALES: readonly PosSaleSummary[] = [
  {
    orderId: 'ord-pos-seed-0001',
    receiptNumber: 'POS-HCM-0001',
    warehouseId: 'WH-HCM-01',
    paymentMethod: 'POS_CASH',
    totalVnd: 400000,
    itemCount: 2,
    createdAt: '2026-11-23T09:15:00.000Z',
    cashierId: 'usr-wh-hcm',
  },
  {
    orderId: 'ord-pos-seed-0002',
    receiptNumber: 'POS-HN-0001',
    warehouseId: 'WH-HN-01',
    paymentMethod: 'POS_CARD',
    totalVnd: 300000,
    itemCount: 1,
    createdAt: '2026-11-23T10:30:00.000Z',
    cashierId: 'usr-wh-hn',
  },
]

function createInitialState(): MockPosState {
  const catalog = new Map<string, MockSkuRecord>()
  for (const item of SEED_CATALOG) {
    catalog.set(item.skuId, {
      ...item,
      stockByWarehouse: { ...item.stockByWarehouse },
    })
  }
  return {
    catalog,
    sales: SEED_SALES.map((sale) => ({ ...sale })),
    receiptsByKey: new Map<string, PosSaleReceipt>(),
    sequence: 100,
  }
}

let state: MockPosState = createInitialState()

export function resetMockPosStore(): void {
  state = createInitialState()
}

function hasWarehouseScope(warehouseId: string, scopes?: readonly string[]): boolean {
  if (!scopes || scopes.length === 0) return true
  if (scopes.includes('*') || scopes.includes('ALL')) return true
  return scopes.includes(warehouseId)
}

function warehouseShortCode(warehouseId: string): string {
  const parts = warehouseId.split('-')
  return parts[1] ?? warehouseId
}

export function searchMockPosCatalog(query: string): PosCatalogItem[] {
  const normalized = query.trim().toLowerCase()
  const items: PosCatalogItem[] = []
  for (const sku of state.catalog.values()) {
    if (
      normalized.length === 0 ||
      sku.skuId.toLowerCase().includes(normalized) ||
      sku.name.toLowerCase().includes(normalized)
    ) {
      items.push({
        skuId: sku.skuId,
        name: sku.name,
        unitPriceVnd: sku.unitPriceVnd,
        availableByWarehouse: { ...sku.stockByWarehouse },
      })
    }
  }
  return items
}

export function listMockPosSales(
  warehouseId?: string,
  allowedWarehouseScopes?: readonly string[]
): PosSaleSummary[] {
  if (warehouseId) {
    if (!hasWarehouseScope(warehouseId, allowedWarehouseScopes)) {
      throw new PosApiError(
        403,
        'WAREHOUSE_SCOPE_DENIED',
        `Access denied for warehouse ${warehouseId}`
      )
    }
    return state.sales
      .filter((sale) => sale.warehouseId === warehouseId)
      .map((sale) => ({ ...sale }))
  }

  return state.sales
    .filter((sale) => hasWarehouseScope(sale.warehouseId, allowedWarehouseScopes))
    .map((sale) => ({ ...sale }))
}

export function createMockPosSale(
  req: CreatePosSaleRequest,
  idempotencyKey: string,
  options?: { cashierId?: string; allowedWarehouseScopes?: readonly string[] }
): PosSaleReceipt {
  const trimmedKey = idempotencyKey.trim()
  if (!trimmedKey) {
    throw new PosApiError(400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key header is required')
  }

  const cashierId = options?.cashierId ?? 'usr-pos-mock'
  const scopedKey = `${cashierId}:${trimmedKey}`
  const existing = state.receiptsByKey.get(scopedKey)
  if (existing) {
    return {
      ...existing,
      items: existing.items.map((item) => ({ ...item })),
    }
  }

  if (!req.warehouseId || !WAREHOUSES.includes(req.warehouseId)) {
    throw new PosApiError(400, 'INVALID_WAREHOUSE', `Unknown warehouse ${req.warehouseId}`)
  }

  if (!hasWarehouseScope(req.warehouseId, options?.allowedWarehouseScopes)) {
    throw new PosApiError(
      403,
      'WAREHOUSE_SCOPE_DENIED',
      `Cashier is not permitted to sell from ${req.warehouseId}`
    )
  }

  if (req.paymentMethod !== 'POS_CASH' && req.paymentMethod !== 'POS_CARD') {
    throw new PosApiError(400, 'INVALID_PAYMENT_METHOD', 'Unsupported POS payment method')
  }

  if (!Array.isArray(req.items) || req.items.length === 0) {
    throw new PosApiError(400, 'EMPTY_ITEMS', 'At least one SKU is required')
  }

  const seenSkus = new Set<string>()
  const resolvedItems: PosSaleItem[] = []

  for (const line of req.items) {
    const skuId = line.skuId.trim()
    if (!skuId || !Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new PosApiError(400, 'INVALID_ITEM', 'Each item must have a SKU and quantity >= 1')
    }
    if (seenSkus.has(skuId)) {
      throw new PosApiError(400, 'DUPLICATE_SKU', `Duplicate SKU ${skuId}`)
    }
    seenSkus.add(skuId)

    const catalogSku = state.catalog.get(skuId)
    if (!catalogSku) {
      throw new PosApiError(422, 'INVALID_SKU', `Unknown or unpriced SKU ${skuId}`)
    }

    const available = catalogSku.stockByWarehouse[req.warehouseId] ?? 0
    if (available < line.quantity) {
      throw new PosApiError(
        409,
        'INSUFFICIENT_STOCK',
        `Insufficient stock for ${skuId} in ${req.warehouseId}`
      )
    }

    resolvedItems.push({
      skuId: catalogSku.skuId,
      name: catalogSku.name,
      quantity: line.quantity,
      unitPriceVnd: catalogSku.unitPriceVnd,
      lineTotalVnd: catalogSku.unitPriceVnd * line.quantity,
    })
  }

  const subtotalVnd = resolvedItems.reduce((sum, item) => sum + item.lineTotalVnd, 0)
  const totalVnd = subtotalVnd

  let cashReceivedVnd: number | undefined
  let changeDueVnd: number | undefined

  if (req.paymentMethod === 'POS_CASH') {
    if (req.cashReceivedVnd !== undefined) {
      if (req.cashReceivedVnd < 0) {
        throw new PosApiError(
          400,
          'INSUFFICIENT_CASH_TENDERED',
          'Cash tendered must be at least the total amount'
        )
      }
      if (req.cashReceivedVnd > 0 && req.cashReceivedVnd < totalVnd) {
        throw new PosApiError(
          400,
          'INSUFFICIENT_CASH_TENDERED',
          'Cash tendered must be at least the total amount'
        )
      }
      cashReceivedVnd = req.cashReceivedVnd > 0 ? req.cashReceivedVnd : totalVnd
      changeDueVnd = cashReceivedVnd - totalVnd
    } else {
      cashReceivedVnd = totalVnd
      changeDueVnd = 0
    }
  }

  for (const item of resolvedItems) {
    const sku = state.catalog.get(item.skuId)
    if (sku) {
      sku.stockByWarehouse[req.warehouseId] =
        (sku.stockByWarehouse[req.warehouseId] ?? 0) - item.quantity
    }
  }

  state.sequence += 1
  const suffix = String(state.sequence).padStart(4, '0')
  const orderId = `ord-pos-${suffix}`
  const receiptNumber = `POS-${warehouseShortCode(req.warehouseId)}-${suffix}`
  const createdAt = new Date().toISOString()

  const receipt: PosSaleReceipt = {
    orderId,
    receiptNumber,
    channel: 'POS',
    warehouseId: req.warehouseId,
    cashierId,
    paymentMethod: req.paymentMethod,
    paymentStatus: 'COLLECTED',
    status: 'DELIVERY_COMPLETE',
    subtotalVnd,
    totalVnd,
    ...(cashReceivedVnd !== undefined && { cashReceivedVnd }),
    ...(changeDueVnd !== undefined && { changeDueVnd }),
    ...(req.customerNote?.trim() && { customerNote: req.customerNote.trim() }),
    items: resolvedItems,
    createdAt,
  }

  state.receiptsByKey.set(scopedKey, receipt)
  state.sales.unshift({
    orderId,
    receiptNumber,
    warehouseId: req.warehouseId,
    paymentMethod: req.paymentMethod,
    totalVnd,
    itemCount: resolvedItems.reduce((sum, item) => sum + item.quantity, 0),
    createdAt,
    cashierId,
  })

  return {
    ...receipt,
    items: receipt.items.map((item) => ({ ...item })),
  }
}
