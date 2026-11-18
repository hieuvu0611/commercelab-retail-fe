export interface Supplier {
  supplierId: string
  name: string
  code: string
  contactEmail: string
  phone: string
  address: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface PurchaseOrderLine {
  id?: number
  poId?: string
  skuId: string
  orderedQty: number
  unitCostVnd: number
  receivedQty?: number
  damagedQty?: number
  shortQty?: number
}

export type POStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface PurchaseOrder {
  poId: string
  supplierId: string
  supplierName?: string
  warehouseId: string
  status: POStatus
  totalAmountVnd: number
  createdBy: string
  approvedBy?: string
  approvedAt?: string
  notes: string
  lines: PurchaseOrderLine[]
  createdAt: string
  updatedAt: string
}

export interface ReceivingInspectionLine {
  skuId: string
  deliveredQty: number
  passedQty: number
  damagedQty: number
  shortQty: number
}

export interface ReceivingInspection {
  inspectionId: string
  poId: string
  warehouseId: string
  inspectorId: string
  status: string
  notes: string
  lines: ReceivingInspectionLine[]
  createdAt: string
}

export interface SupplierReturnLine {
  skuId: string
  quantity: number
  reason: string
}

export interface SupplierReturn {
  returnId: string
  supplierId: string
  supplierName?: string
  warehouseId: string
  poId?: string
  status: 'DRAFT' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED'
  createdBy: string
  dispatchedBy?: string
  dispatchedAt?: string
  trackingNumber?: string
  notes: string
  lines: SupplierReturnLine[]
  createdAt: string
  updatedAt: string
}

export interface StocktakeLine {
  skuId: string
  systemOnHand: number
  countedOnHand: number
  diffQty: number
  unitCostVnd: number
  diffAmountVnd: number
}

export interface Stocktake {
  stocktakeId: string
  warehouseId: string
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'CANCELLED'
  startedBy: string
  notes: string
  lines?: StocktakeLine[]
  createdAt: string
  completedAt?: string
}

export interface StockAdjustment {
  adjustmentId: string
  stocktakeId: string
  warehouseId: string
  skuId: string
  diffQty: number
  unitCostVnd: number
  diffAmountVnd: number
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  makerId: string
  checkerId?: string
  decidedAt?: string
  reason: string
  createdAt: string
}
