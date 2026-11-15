// Fulfillment and delivery API types (Phase 6). The wire shapes are contract GUESSES until they are reconciled with
// the real fulfillment service (P6-T01..T06); src/fulfillment/adapters.ts is the only place that reads raw responses.

/**
 * Where a parcel is on its way to the customer. PICKING and PACKING happen in the warehouse, HANDED_OVER is the moment
 * the carrier takes the parcel, the rest come from the carrier.
 */
export const TRACKING_STATUSES = [
  'CONFIRMED',
  'PICKING',
  'PACKING',
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
] as const
export type TrackingStatus = (typeof TRACKING_STATUSES)[number]

/** One entry of the customer's tracking timeline: GET /orders/{id}/tracking. */
export interface TrackingEvent {
  /** ISO timestamp. */
  time: string
  /** A sentence for the customer; empty when the service sent none (the page then words it from the status). */
  label: string
  status: TrackingStatus
  /** Why a delivery failed; null for every other event. */
  reason: string | null
}

export interface OrderTracking {
  orderId: string
  /** The latest status. */
  status: TrackingStatus
  carrier: string | null
  trackingCode: string | null
  /** Oldest first. */
  events: TrackingEvent[]
  /** ISO timestamp the return window closes; only set after delivery. */
  returnWindowEndsAt: string | null
}
