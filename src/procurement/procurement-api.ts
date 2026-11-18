import { storefrontApi } from '@/services/api/clients'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  ReceivingInspection,
  StockAdjustment,
  Stocktake,
  Supplier,
  SupplierReturn,
} from '@/types/procurement'

const quiet = { skipUnauthorizedHandler: true } as const

// React Query keys
export const SUPPLIERS_KEY = ['procurement-suppliers'] as const
export const PURCHASE_ORDERS_KEY = ['procurement-orders'] as const
export const purchaseOrderKey = (poId: string) => ['procurement-order', poId] as const
export const RECEIVING_INSPECTIONS_KEY = ['receiving-inspections'] as const
export const SUPPLIER_RETURNS_KEY = ['supplier-returns'] as const
export const supplierReturnKey = (id: string) => ['supplier-return', id] as const
export const STOCKTAKES_KEY = ['inventory-stocktakes'] as const
export const stocktakeKey = (id: string) => ['inventory-stocktake', id] as const
export const STOCK_ADJUSTMENTS_KEY = ['inventory-adjustments'] as const

// Suppliers
export async function listSuppliers(): Promise<Supplier[]> {
  const { data } = await storefrontApi.get<Supplier[]>('/admin/procurement/suppliers', quiet)
  return data ?? []
}

export async function createSupplier(payload: {
  supplierId?: string
  name: string
  code: string
  contactEmail?: string
  phone?: string
  address?: string
}): Promise<Supplier> {
  const { data } = await storefrontApi.post<Supplier>('/admin/procurement/suppliers', payload, quiet)
  return data!
}

// Purchase Orders
export async function listPurchaseOrders(params?: {
  warehouseId?: string
  status?: string
}): Promise<PurchaseOrder[]> {
  const { data } = await storefrontApi.get<PurchaseOrder[]>('/admin/procurement/orders', {
    ...quiet,
    params,
  })
  return data ?? []
}

export async function getPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  const { data } = await storefrontApi.get<PurchaseOrder>(
    `/admin/procurement/orders/${encodeURIComponent(poId)}`,
    quiet
  )
  return data!
}

export async function createPurchaseOrder(payload: {
  poId?: string
  supplierId: string
  warehouseId?: string
  notes?: string
  lines: PurchaseOrderLine[]
}): Promise<PurchaseOrder> {
  const { data } = await storefrontApi.post<PurchaseOrder>(
    '/admin/procurement/orders',
    payload,
    quiet
  )
  return data!
}

export async function approvePurchaseOrder(poId: string): Promise<PurchaseOrder> {
  const { data } = await storefrontApi.post<PurchaseOrder>(
    `/admin/procurement/orders/${encodeURIComponent(poId)}/approve`,
    {},
    quiet
  )
  return data!
}

export async function rejectPurchaseOrder(poId: string, reason?: string): Promise<PurchaseOrder> {
  const { data } = await storefrontApi.post<PurchaseOrder>(
    `/admin/procurement/orders/${encodeURIComponent(poId)}/reject`,
    { reason },
    quiet
  )
  return data!
}

// Receiving Inspections (SC09)
export async function recordReceivingInspection(payload: {
  poId: string
  notes?: string
  lines: Array<{
    skuId: string
    deliveredQty: number
    passedQty: number
    damagedQty: number
  }>
}): Promise<ReceivingInspection> {
  const { data } = await storefrontApi.post<ReceivingInspection>(
    '/admin/inventory/receiving/inspections',
    payload,
    quiet
  )
  return data!
}

export async function listReceivingInspections(params?: {
  warehouseId?: string
  poId?: string
}): Promise<ReceivingInspection[]> {
  const { data } = await storefrontApi.get<ReceivingInspection[]>(
    '/admin/inventory/receiving/inspections',
    { ...quiet, params }
  )
  return data ?? []
}

// Supplier Returns
export async function createSupplierReturn(payload: {
  returnId?: string
  supplierId: string
  warehouseId?: string
  poId?: string
  notes?: string
  lines: Array<{ skuId: string; quantity: number; reason: string }>
}): Promise<SupplierReturn> {
  const { data } = await storefrontApi.post<SupplierReturn>(
    '/admin/inventory/supplier-returns',
    payload,
    quiet
  )
  return data!
}

export async function dispatchSupplierReturn(
  returnId: string,
  trackingNumber?: string
): Promise<SupplierReturn> {
  const { data } = await storefrontApi.post<SupplierReturn>(
    `/admin/inventory/supplier-returns/${encodeURIComponent(returnId)}/dispatch`,
    { trackingNumber },
    quiet
  )
  return data!
}

export async function getSupplierReturn(returnId: string): Promise<SupplierReturn> {
  const { data } = await storefrontApi.get<SupplierReturn>(
    `/admin/inventory/supplier-returns/${encodeURIComponent(returnId)}`,
    quiet
  )
  return data!
}

export async function listSupplierReturns(params?: {
  warehouseId?: string
  supplierId?: string
}): Promise<SupplierReturn[]> {
  const { data } = await storefrontApi.get<SupplierReturn[]>(
    '/admin/inventory/supplier-returns',
    { ...quiet, params }
  )
  return data ?? []
}

// Stocktakes
export async function createStocktake(warehouseId?: string, notes?: string): Promise<Stocktake> {
  const { data } = await storefrontApi.post<Stocktake>(
    '/admin/inventory/stocktakes',
    { warehouseId, notes },
    quiet
  )
  return data!
}

export async function getStocktake(stocktakeId: string): Promise<Stocktake> {
  const { data } = await storefrontApi.get<Stocktake>(
    `/admin/inventory/stocktakes/${encodeURIComponent(stocktakeId)}`,
    quiet
  )
  return data!
}

export async function listStocktakes(warehouseId?: string): Promise<Stocktake[]> {
  const { data } = await storefrontApi.get<Stocktake[]>('/admin/inventory/stocktakes', {
    ...quiet,
    params: { warehouseId },
  })
  return data ?? []
}

export async function submitStocktakeCount(
  stocktakeId: string,
  lines: Array<{ skuId: string; countedOnHand: number; unitCostVnd?: number }>
): Promise<{ stocktake: Stocktake; adjustments: StockAdjustment[] }> {
  const { data } = await storefrontApi.post<{
    stocktake: Stocktake
    adjustments: StockAdjustment[]
  }>(`/admin/inventory/stocktakes/${encodeURIComponent(stocktakeId)}/count`, { lines }, quiet)
  return data!
}

// Stock Adjustments
export async function listStockAdjustments(params?: {
  warehouseId?: string
  status?: string
}): Promise<StockAdjustment[]> {
  const { data } = await storefrontApi.get<StockAdjustment[]>('/admin/inventory/adjustments', {
    ...quiet,
    params,
  })
  return data ?? []
}

export async function decideStockAdjustment(
  adjustmentId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string
): Promise<StockAdjustment> {
  const { data } = await storefrontApi.post<StockAdjustment>(
    `/admin/inventory/adjustments/${encodeURIComponent(adjustmentId)}/decide`,
    { action, note },
    quiet
  )
  return data!
}
