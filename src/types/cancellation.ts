// Cancellation contract (Phase 7). These shapes are a provisional reading of P7-T01/T02 (the specs are still being
// refined): src/orders/adapters.ts and src/orders/cancel-api.ts are the only places that read the raw responses, so
// reconciling with the real services (P7-T07) only touches those files and this one.

/** Reasons the customer can pick; the code is what the service receives, so no free text (and no personal data) is sent. */
export const CANCEL_REASONS = [
  { code: 'CHANGED_MIND', label: 'I changed my mind' },
  { code: 'ORDERED_BY_MISTAKE', label: 'I ordered by mistake' },
  { code: 'FOUND_BETTER_PRICE', label: 'I found a better price' },
  { code: 'DELIVERY_TOO_SLOW', label: 'Delivery would take too long' },
  { code: 'OTHER', label: 'Another reason' },
] as const
export type CancelReasonCode = (typeof CANCEL_REASONS)[number]['code']

/**
 * Where the customer's cancellation request stands: REQUESTED while the warehouse still has to stop the parcel,
 * CONFIRMED once it did, REFUSED when the parcel was handed over first (SC06 branch B).
 */
export const CANCELLATION_STATUSES = ['REQUESTED', 'CONFIRMED', 'REFUSED'] as const
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number]

export interface OrderCancellation {
  status: CancellationStatus
}

/** Money owed back to the customer for a cancelled paid order. An order can be cancelled while its refund is pending. */
export const REFUND_STATUSES = ['PENDING', 'COMPLETED'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

export interface OrderRefund {
  amountVnd: number
  status: RefundStatus
}
