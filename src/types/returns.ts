// Returns contract (Phase 8). These shapes are a provisional reading of P8-T02..T05 (the phase spec is still being
// refined): src/returns/adapters.ts and src/returns/returns-api.ts are the only places that read the raw responses, so
// reconciling with the real service (P8-T09) only touches those files and this one. Amounts are integer VND.

/**
 * Reasons the customer can pick. The code is what the service receives (no free text, so no personal data). A change of
 * mind is the customer's own choice (P09: the original shipping is not refunded); the other reasons claim a seller error
 * that support has to confirm (P11).
 */
export const RETURN_REASONS = [
  { code: 'CHANGED_MIND', label: 'I changed my mind', isSellerError: false },
  { code: 'WRONG_ITEM', label: 'I received the wrong item', isSellerError: true },
  { code: 'DAMAGED', label: 'It arrived damaged', isSellerError: true },
  { code: 'DEFECTIVE', label: 'It does not work properly', isSellerError: true },
  { code: 'NOT_AS_DESCRIBED', label: 'It is not as described', isSellerError: true },
] as const
export type ReturnReasonCode = (typeof RETURN_REASONS)[number]['code']

/**
 * Where a return case stands: asked for, approved by support, received by the warehouse, inspected (QC_PASSED when at least
 * one unit passed, QC_FAILED when none did), refund waiting for approval, refunded, or refused by support.
 */
export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'QC_PASSED',
  'QC_FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'REJECTED',
] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]

/** One line of a return case. */
export interface ReturnLine {
  skuId: string
  skuName: string
  /** Units the customer asked to return. */
  quantity: number
  /** Units the warehouse received; 0 until it did. */
  receivedQuantity: number
  /** Units that passed inspection; they are refunded and go back on sale. */
  passedQuantity: number
  /** Units that failed inspection. */
  failedQuantity: number
  /** What the customer effectively paid for one unit after the voucher share (the base of the refund). */
  allocatedUnitPaidVnd: number
}

/** Money owed back for a return case. */
export interface ReturnRefund {
  /** What is refunded: goods plus any shipping. */
  amountVnd: number
  goodsVnd: number
  shippingVnd: number
  /** PENDING is waiting for an approver (the amount is reserved); COMPLETED was paid back. */
  status: 'PENDING' | 'COMPLETED'
}

/** A return case as the customer sees it: POST /returns, GET /returns/{id}, GET /returns?orderId=. */
export interface ReturnCase {
  returnId: string
  orderId: string
  status: ReturnStatus
  reason: ReturnReasonCode
  lines: ReturnLine[]
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  /** The refund once one was proposed; null before. */
  refund: ReturnRefund | null
  /** Why support refused the request; empty otherwise. */
  rejectionNote: string
}

/** The units of one SKU that can still be returned, from the tracking quantities (I07). */
export interface ReturnableLine {
  skuId: string
  skuName: string
  delivered: number
  /** Units already in return cases that still hold the quantity, or were accepted. */
  returned: number
  /** delivered - returned, never below 0. */
  remaining: number
  allocatedUnitPaidVnd: number
}

/** What the customer sends: one reason for the whole request and the units to return per line. */
export interface ReturnRequestInput {
  orderId: string
  reason: ReturnReasonCode
  lines: Array<{ skuId: string; quantity: number }>
}

/** Detail of a return case in backoffice workbench. */
export interface BackofficeReturnDetail extends ReturnCase {
  userId: string
  warehouseId: string
  history: Array<{ at: string; type: string; actor: string }>
  linkedOrderId?: string
}

/** Approval record for high-value returns or sensitive operations (P10 Maker-Checker). */
export interface ApprovalRecord {
  id: string
  rmaId: string
  referenceId?: string
  quantityDiff?: number
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
