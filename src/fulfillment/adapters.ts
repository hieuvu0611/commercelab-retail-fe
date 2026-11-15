import {
  TRACKING_STATUSES,
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
