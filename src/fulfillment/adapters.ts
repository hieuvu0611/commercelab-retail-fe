import {
  SHIPMENT_STATUSES,
  TRACKING_STATUSES,
  type ShipmentDetail,
  type ShipmentLine,
  type ShipmentRow,
  type ShipmentStatus,
  type OrderTracking,
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

function toEvent(raw: unknown): TrackingEvent | null {
  const event = asRaw(raw)
  const status = trackingStatus(event.status)
  const time = text(event.time) || text(event.occurredAt)
  if (!status || Number.isNaN(Date.parse(time))) return null
  return { time, label: text(event.label), status, reason: text(event.reason) || null }
}

/** Events are sorted oldest first and the latest one decides the status, so a late-arriving row cannot rewind it. */
export function toOrderTracking(raw: unknown): OrderTracking {
  const tracking = asRaw(raw)
  const events = (Array.isArray(tracking.events) ? tracking.events : [])
    .map(toEvent)
    .filter((event): event is TrackingEvent => event !== null)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const returnEnd = text(tracking.returnWindowEndsAt)
  return {
    orderId: text(tracking.orderId),
    status: events.at(-1)?.status ?? trackingStatus(tracking.status) ?? 'CONFIRMED',
    carrier: text(tracking.carrier) || null,
    trackingCode: text(tracking.trackingCode) || null,
    events,
    returnWindowEndsAt: Number.isNaN(Date.parse(returnEnd)) ? null : returnEnd,
  }
}

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

/** An unknown status is read as blocked: the safe reading, since a blocked shipment can never be handed over. */
const shipmentStatus = (value: unknown): ShipmentStatus =>
  SHIPMENT_STATUSES.find((status) => status === value) ?? 'PICK_BLOCKED'

export function toShipmentRow(raw: unknown): ShipmentRow {
  const shipment = asRaw(raw)
  const orderId = text(shipment.orderId)
  return {
    shipmentId: text(shipment.shipmentId) || text(shipment.id) || `SHP-${orderId}`,
    orderId,
    warehouseId: text(shipment.warehouseId),
    status: shipmentStatus(shipment.status),
    itemCount: whole(shipment.itemCount),
    version: whole(shipment.version),
    createdAt: text(shipment.createdAt),
  }
}

function toShipmentLine(raw: unknown): ShipmentLine {
  const line = asRaw(raw)
  return {
    skuId: text(line.skuId),
    skuName: text(line.skuName) || text(line.skuId),
    orderedQuantity: whole(line.orderedQuantity ?? line.quantity),
    pickedQuantity: whole(line.pickedQuantity),
  }
}

export function toShipmentDetail(raw: unknown): ShipmentDetail {
  const shipment = asRaw(raw)
  const lines = (Array.isArray(shipment.lines) ? shipment.lines : []).map(toShipmentLine)
  return {
    ...toShipmentRow(raw),
    itemCount:
      whole(shipment.itemCount) || lines.reduce((sum, line) => sum + line.orderedQuantity, 0),
    lines,
    handedOverAt: text(shipment.handedOverAt) || null,
    shortageSkuId: text(shipment.shortageSkuId) || null,
    shortageReason: text(shipment.shortageReason) || null,
  }
}
