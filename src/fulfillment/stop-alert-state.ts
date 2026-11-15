import { STOP_OUTCOMES, type StopAlert, type StopResolution } from '@/types/cancellation'
import type { SseMessage } from './sse-parser'

// Stop alert events: `stop_requested` (a new or replayed open alert) and `stop_resolved` (how it ended). The payload
// shapes are a provisional reading of P7-T04; this is the only file that reads them.

type Raw = Record<string, unknown>

function parse(json: string): Raw | null {
  try {
    const value: unknown = JSON.parse(json)
    return value !== null && typeof value === 'object' ? (value as Raw) : null
  } catch {
    return null
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toStopAlert(json: string): StopAlert | null {
  const raw = parse(json)
  const orderId = text(raw?.orderId)
  const warehouseId = text(raw?.warehouseId)
  if (!raw || !orderId || !warehouseId) return null
  return {
    orderId,
    shipmentId: text(raw.shipmentId) || `SHP-${orderId}`,
    warehouseId,
    requestedAt: text(raw.requestedAt),
  }
}

export function toStopResolution(json: string): StopResolution | null {
  const raw = parse(json)
  const orderId = text(raw?.orderId)
  const outcome = STOP_OUTCOMES.find((value) => value === raw?.outcome)
  if (!raw || !orderId || !outcome) return null
  return { orderId, shipmentId: text(raw.shipmentId) || `SHP-${orderId}`, outcome }
}

/**
 * An alert leaves the list only when the service says it was resolved. Everything else (heartbeats, a replay of an alert
 * already shown, bad data) leaves what the person sees untouched.
 */
export function applyStreamEvent(
  alerts: readonly StopAlert[],
  message: SseMessage
): { alerts: StopAlert[]; resolution?: StopResolution } {
  if (message.event === 'stop_requested') {
    const alert = toStopAlert(message.data)
    if (!alert || alerts.some((entry) => entry.shipmentId === alert.shipmentId))
      return { alerts: [...alerts] }
    return { alerts: [...alerts, alert] }
  }
  if (message.event === 'stop_resolved') {
    const resolution = toStopResolution(message.data)
    if (!resolution) return { alerts: [...alerts] }
    return {
      alerts: alerts.filter((entry) => entry.shipmentId !== resolution.shipmentId),
      resolution,
    }
  }
  return { alerts: [...alerts] }
}
