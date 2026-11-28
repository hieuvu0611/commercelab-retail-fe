export type PosPaymentMethod = 'POS_CASH' | 'POS_CARD'

export const POS_ROLES = ['WAREHOUSE_STAFF', 'WAREHOUSE_MGR', 'OPS_MGR'] as const

export interface PosLineInput {
  skuId: string
  quantity: number
}

export interface PosSaleItem {
  skuId: string
  name: string
  quantity: number
  unitPriceVnd: number
  lineTotalVnd: number
}

export interface CreatePosSaleRequest {
  warehouseId: string
  paymentMethod: PosPaymentMethod
  customerNote?: string
  cashReceivedVnd?: number
  items: PosLineInput[]
}

export interface PosSaleReceipt {
  orderId: string
  receiptNumber: string
  channel: 'POS'
  warehouseId: string
  cashierId: string
  paymentMethod: PosPaymentMethod
  paymentStatus: string
  status: string
  subtotalVnd: number
  totalVnd: number
  cashReceivedVnd?: number
  changeDueVnd?: number
  customerNote?: string
  items: PosSaleItem[]
  createdAt: string
}

export interface PosSaleSummary {
  orderId: string
  receiptNumber: string
  warehouseId: string
  paymentMethod: PosPaymentMethod
  totalVnd: number
  itemCount: number
  createdAt: string
  cashierId: string
}

export interface PosCatalogItem {
  skuId: string
  name: string
  unitPriceVnd: number
  availableByWarehouse?: Record<string, number>
}

export class PosApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'PosApiError'
    this.status = status
    this.code = code
  }
}
