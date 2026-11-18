import {
  SHIPMENT_STATUSES,
  TRACKING_STATUSES,
  type ShipmentDetail,
  type ShipmentLine,
  type ShipmentRow,
  type ShipmentStatus,
  type OrderTracking,
  type TrackingQuantity,
  type TrackingEvent,
  type TrackingStatus,
} from '@/types/fulfillment'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A status this version does not know is dropped by the caller rather than guessed. */
const trackingStatus = (value: unknown): TrackingStatus | null =>
  TRACKING_STATUSES.find((status) => status === value) ?? null

/**
 * The service writes the timeline with its own entry types; the first two name the start of the shipment and map to the
 * statuses the page words.
 */
const ENTRY_STATUS: Record<string, TrackingStatus> = {
  CREATED: 'PENDING_PICK',
  PICKING_STARTED: 'PICKING',
}

function toEvent(raw: unknown): TrackingEvent | null {
  const entry = asRaw(raw)
  const type = text(entry.type)
  const status = ENTRY_STATUS[type] ?? trackingStatus(type)
  const time = text(entry.at)
  if (!status || Number.isNaN(Date.parse(time))) return null
  return { time, label: text(entry.message), status }
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

function toQuantity(raw: unknown): TrackingQuantity {
  const line = asRaw(raw)
  return {
    skuId: text(line.skuId),
    ordered: count(line.ordered),
    dispatched: count(line.dispatched),
    delivered: count(line.delivered),
    returned: count(line.returned),
  }
}

/** Events are sorted oldest first and the latest one decides the status, so a late-arriving row cannot rewind it. */
function toParcelTracking(raw: unknown): OrderTracking['parcels'] extends (infer T)[] | undefined ? T | null : never {
  const parcel = asRaw(raw)
  const shipmentId = text(parcel.shipmentId)
  if (!shipmentId) return null
  const events = (Array.isArray(parcel.timeline) ? parcel.timeline : [])
    .map(toEvent)
    .filter((event): event is TrackingEvent => event !== null)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const returnEnd = text(parcel.returnWindowEndsAt)
  return {
    shipmentId,
    warehouseId: text(parcel.warehouseId),
    parcelIndex: whole(parcel.parcelIndex) || 1,
    totalParcels: whole(parcel.totalParcels) || 1,
    status: trackingStatus(parcel.status) ?? events.at(-1)?.status ?? 'CONFIRMED',
    paymentMethod: text(parcel.paymentMethod) || 'PREPAID',
    codAmountToCollect: whole(parcel.codAmountToCollect),
    handedOverAt: text(parcel.handedOverAt) || null,
    deliveredAt: text(parcel.deliveredAt) || null,
    returnWindowEndsAt: Number.isNaN(Date.parse(returnEnd)) ? null : returnEnd,
    quantities: (Array.isArray(parcel.quantities) ? parcel.quantities : []).map(toQuantity),
    events,
  }
}

export function toOrderTracking(raw: unknown): OrderTracking {
  const tracking = asRaw(raw)
  const events = (Array.isArray(tracking.timeline) ? tracking.timeline : [])
    .map(toEvent)
    .filter((event): event is TrackingEvent => event !== null)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const returnEnd = text(tracking.returnWindowEndsAt)
  const parcels = (Array.isArray(tracking.parcels) ? tracking.parcels : [])
    .map(toParcelTracking)
    .filter((parcel): parcel is NonNullable<OrderTracking['parcels']>[number] => parcel !== null)
    .sort((a, b) => a.parcelIndex - b.parcelIndex)
  return {
    orderId: text(tracking.orderId),
    status: trackingStatus(tracking.status) ?? events.at(-1)?.status ?? 'CONFIRMED',
    events,
    quantities: (Array.isArray(tracking.quantities) ? tracking.quantities : []).map(toQuantity),
    returnWindowEndsAt: Number.isNaN(Date.parse(returnEnd)) ? null : returnEnd,
    paymentMethod: text(tracking.paymentMethod) || 'PREPAID',
    codAmountToCollect: whole(tracking.codAmountToCollect),
    parcels: parcels.length > 0 ? parcels : undefined,
  }
}

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

/** An unknown status is read as blocked: the safe reading, since a blocked shipment can never be handed over. */
const shipmentStatus = (value: unknown): ShipmentStatus =>
  SHIPMENT_STATUSES.find((status) => status === value) ?? 'PICK_BLOCKED'

const toShipmentLine = (raw: unknown): ShipmentLine => {
  const line = asRaw(raw)
  return {
    skuId: text(line.skuId),
    orderedQuantity: whole(line.quantity),
    pickedQuantity: whole(line.pickedQuantity),
  }
}

const linesOf = (shipment: Raw): ShipmentLine[] =>
  (Array.isArray(shipment.items) ? shipment.items : []).map(toShipmentLine)

export function toShipmentRow(raw: unknown): ShipmentRow {
  const shipment = asRaw(raw)
  const orderId = text(shipment.orderId)
  const parcelIndex = whole(shipment.parcelIndex)
  const totalParcels = whole(shipment.totalParcels)
  return {
    shipmentId: text(shipment.shipmentId) || `SHP-${orderId}`,
    orderId,
    warehouseId: text(shipment.warehouseId),
    ...(parcelIndex > 0 && { parcelIndex }),
    ...(totalParcels > 0 && { totalParcels }),
    status: shipmentStatus(shipment.status),
    itemCount: linesOf(shipment).reduce((sum, line) => sum + line.orderedQuantity, 0),
    version: whole(shipment.version),
    paymentMethod: text(shipment.paymentMethod) || 'PREPAID',
    codAmountToCollect: whole(shipment.codAmountToCollect),
    createdAt: text(shipment.createdAt),
  }
}

export function toShipmentDetail(raw: unknown): ShipmentDetail {
  const shipment = asRaw(raw)
  const returnEnd = text(shipment.returnWindowEndsAt)
  return {
    ...toShipmentRow(raw),
    ...(shipment.stopRequestedAt !== undefined && { stopRequestedAt: text(shipment.stopRequestedAt) || null }),
    ...(text(shipment.stopConfirmedAt) && { stopConfirmedAt: text(shipment.stopConfirmedAt) }),
    lines: linesOf(shipment),
    handedOverAt: text(shipment.handedOverAt) || null,
    deliveredAt: text(shipment.deliveredAt) || null,
    returnWindowEndsAt: Number.isNaN(Date.parse(returnEnd)) ? null : returnEnd,
    failureReason: text(shipment.failureReason) || null,
  }
}
