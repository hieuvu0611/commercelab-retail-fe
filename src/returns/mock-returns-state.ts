import type { ReturnReasonCode, ReturnStatus } from '@/types/returns'

/** Return cases of the in-app mock backend (/mock-api). Kept apart from the handlers so tracking can read it without a cycle. */

export interface MockReturnLine {
  skuId: string
  skuName: string
  quantity: number
  receivedQuantity: number
  qcPassed: number
  qcFailed: number
  allocatedUnitPaidVnd: number
}

export interface MockReturnRefund {
  amountVnd: number
  goodsVnd: number
  shippingVnd: number
  status: 'PENDING' | 'COMPLETED'
  /** Who proposed it: nobody approves their own proposal (P10). */
  proposedBy: string
  /** The approval the amount needs (threshold rule, P8-T05). */
  requiredApproval: 'SUPPORT_LEAD' | 'OPS_FINANCE'
  sellerErrorConfirmed: boolean
}

export interface MockReturnEvent {
  at: string
  type: string
  actor: string
}

export interface MockApprovalRecord {
  id: string
  rmaId: string
  makerUserId: string
  requestType: string
  amountVnd: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reason?: string
  checkerUserId?: string
  checkerRole?: string
  decisionNote?: string
  createdAt: string
  updatedAt: string
}

export interface MockReturn {
  returnId: string
  orderId: string
  userId: string
  warehouseId: string
  reason: ReturnReasonCode
  status: ReturnStatus
  lines: MockReturnLine[]
  createdAt: string
  updatedAt: string
  rejectionNote: string
  refund: MockReturnRefund | null
  history: MockReturnEvent[]
  linkedOrderId?: string
}

export interface MockReturnsState {
  counter: number
  returns: Map<string, MockReturn>
  /** `${userId}|${idempotencyKey}` -> the case that key created. */
  keys: Map<string, string>
  approvals: Map<string, MockApprovalRecord>
}

export const createMockReturnsState = (): MockReturnsState => ({
  counter: 0,
  returns: new Map(),
  keys: new Map(),
  approvals: new Map(),
})

const globalForReturns = globalThis as unknown as { __mockReturnsState?: MockReturnsState }

export function getMockReturnsState(): MockReturnsState {
  globalForReturns.__mockReturnsState ??= createMockReturnsState()
  return globalForReturns.__mockReturnsState
}

/**
 * Units of one SKU of an order that return cases still hold or have accepted (I07). A refused case holds nothing; once
 * inspected only the units that passed stay held, so the failed ones are released exactly once.
 */
export function heldQuantity(state: MockReturnsState, orderId: string, skuId: string): number {
  let held = 0
  for (const item of state.returns.values()) {
    if (item.orderId !== orderId || item.status === 'REJECTED') continue
    const line = item.lines.find((entry) => entry.skuId === skuId)
    if (!line) continue
    const isInspected = ['QC_PASSED', 'QC_FAILED', 'REFUND_PENDING', 'REFUNDED'].includes(
      item.status
    )
    held += isInspected ? line.qcPassed : line.quantity
  }
  return held
}
