// Fulfillment and delivery API types (Phase 6). The wire shapes are contract GUESSES until they are reconciled with
// the real fulfillment service (P6-T01..T06); src/fulfillment/adapters.ts is the only place that reads raw responses.

/**
 * Where a parcel is on its way to the customer. PICKING and PACKING happen in the warehouse, HANDED_OVER is the moment
 * the carrier takes the parcel, the rest come from the carrier.
 */
export const TRACKING_STATUSES = [
  'CONFIRMED',
  'PENDING_PICK',
  'PICKING',
  'PACKING',
  'PACKED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PARTIALLY_DELIVERED',
  'PICK_BLOCKED',
  'STOPPED_FOR_CANCEL',
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

/**
 * Where a shipment is in the warehouse and on the road. PICK_BLOCKED (a shortage) and STOPPED_FOR_CANCEL can never be
 * handed over.
 */
export const SHIPMENT_STATUSES = [
  'PENDING_PICK',
  'PICKING',
  'PACKED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PARTIALLY_DELIVERED',
  'PICK_BLOCKED',
  'STOPPED_FOR_CANCEL',
] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

/** A row of the warehouse queue: GET /admin/shipments. The service only lists shipments of the caller's warehouses. */
export interface ShipmentRow {
  /** SHP-<orderId>: one parcel per order. */
  shipmentId: string
  orderId: string
  warehouseId: string
  status: ShipmentStatus
  itemCount: number
  /** Sent back with every change; an old one is refused with STALE_VERSION. */
  version: number
  /** ISO timestamp. */
  createdAt: string
}

/** One line of the pick list. */
export interface ShipmentLine {
  skuId: string
  skuName: string
  orderedQuantity: number
  pickedQuantity: number
}

/** A shipment with its pick list: GET /admin/shipments/{id} and the answer of every change. */
export interface ShipmentDetail extends ShipmentRow {
  lines: ShipmentLine[]
  /** ISO timestamp; null until the carrier took the parcel. */
  handedOverAt: string | null
  /** The SKU a shortage was reported for and why; null otherwise. */
  shortageSkuId: string | null
  shortageReason: string | null
}
