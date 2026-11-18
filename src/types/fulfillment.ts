// Fulfillment and delivery API types (Phase 6). The wire shapes follow the fulfillment service (P6-T01..T06, reconciled in P6-T09); src/fulfillment/adapters.ts is the only place that reads raw responses.

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
  'RETURN_TO_SENDER',
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
}

/** Units of one SKU of the order along the way; returned stays 0 until returns exist. */
export interface TrackingQuantity {
  skuId: string
  ordered: number
  dispatched: number
  delivered: number
  returned: number
}

export interface ParcelTracking {
  shipmentId: string
  warehouseId: string
  parcelIndex: number
  totalParcels: number
  status: TrackingStatus
  paymentMethod?: string
  codAmountToCollect?: number
  handedOverAt?: string | null
  deliveredAt?: string | null
  returnWindowEndsAt: string | null
  quantities: TrackingQuantity[]
  events: TrackingEvent[]
}

export interface OrderTracking {
  orderId: string
  /** The latest status. */
  status: TrackingStatus
  /** Oldest first. */
  events: TrackingEvent[]
  quantities: TrackingQuantity[]
  /** ISO timestamp the return window closes; only set after delivery. */
  returnWindowEndsAt: string | null
  paymentMethod?: string
  codAmountToCollect?: number
  parcels?: ParcelTracking[]
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
  'RETURN_TO_SENDER',
  'PARTIALLY_DELIVERED',
  'PICK_BLOCKED',
  'STOPPED_FOR_CANCEL',
] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

/** A row of the warehouse queue: GET /admin/shipments. The service only lists shipments of the caller's warehouses. */
export interface ShipmentRow {
  /** SHP-<orderId> or SHP-<orderId>-<parcelIndex> when split across warehouses. */
  shipmentId: string
  orderId: string
  warehouseId: string
  parcelIndex?: number
  totalParcels?: number
  status: ShipmentStatus
  itemCount: number
  /** Sent back with every change; an old one is refused with STALE_VERSION. */
  version: number
  paymentMethod?: string
  codAmountToCollect?: number
  /** ISO timestamp. */
  createdAt: string
}

/** One line of the pick list. */
export interface ShipmentLine {
  skuId: string
  orderedQuantity: number
  pickedQuantity: number
}

/** A shipment with its pick list: GET /admin/shipments/{id} and the answer of every change. */
export interface ShipmentDetail extends ShipmentRow {
  stopConfirmedAt?: string
  stopRequestedAt?: string | null
  lines: ShipmentLine[]
  /** ISO timestamp; null until the carrier took the parcel. */
  handedOverAt: string | null
  /** ISO timestamps; null until the carrier delivered the parcel. */
  deliveredAt: string | null
  returnWindowEndsAt: string | null
  /** Why the parcel is blocked or the delivery failed; null otherwise. */
  failureReason: string | null
}
