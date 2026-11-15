import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { getMockOrderState, type MockOrderState } from '@/orders/mock-orders'

/** Tracking and carrier simulator parts of the in-app mock backend (/mock-api). The wire shapes are guesses (see src/types/fulfillment.ts). */

export const RETURN_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const CARRIER = 'SIM Express'

type MockStatus =
  | 'CONFIRMED'
  | 'PICKING'
  | 'PACKING'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'

interface MockEvent {
  time: string
  label: string
  status: MockStatus
  reason?: string
}

export interface MockShipment {
  orderId: string
  trackingCode: string
  events: MockEvent[]
  /** Carrier notice ids already applied: a repeated notice changes nothing. */
  seenEventIds: Set<string>
  returnWindowEndsAt: string | null
}

export interface MockFulfillmentState {
  shipments: Map<string, MockShipment>
}

export const createMockFulfillmentState = (): MockFulfillmentState => ({ shipments: new Map() })

const globalForFulfillment = globalThis as unknown as {
  __mockFulfillmentState?: MockFulfillmentState
}

export function getMockFulfillmentState(): MockFulfillmentState {
  globalForFulfillment.__mockFulfillmentState ??= createMockFulfillmentState()
  return globalForFulfillment.__mockFulfillmentState
}

export interface FulfillmentMockDeps {
  orders: MockOrderState
  fulfillment: MockFulfillmentState
  now: () => number
}

const defaultDeps = (): FulfillmentMockDeps => ({
  orders: getMockOrderState(),
  fulfillment: getMockFulfillmentState(),
  now: Date.now,
})

const ok = (data: unknown, message = 'OK'): MockResponse => ({
  status: 200,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({
  status,
  body: { message, code, status, ...(errors && { errors }) },
})

const invalid = (field: string, message: string) =>
  failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', { [field]: [message] })

/** What each carrier notice may follow. */
const CARRIER_FLOW: Record<string, readonly MockStatus[]> = {
  IN_TRANSIT: ['PACKING', 'HANDED_OVER'],
  DELIVERED: ['IN_TRANSIT'],
  DELIVERY_FAILED: ['IN_TRANSIT'],
}

const CARRIER_LABELS: Record<string, string> = {
  IN_TRANSIT: 'Your parcel is on its way',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery attempt failed',
}

const latest = (shipment: MockShipment): MockEvent => shipment.events[shipment.events.length - 1]

const iso = (ms: number) => new Date(ms).toISOString()

/** A confirmed order gets its shipment the first time anything asks for it (the real service creates it from OrderConfirmed). */
function shipmentOf(orderId: string, deps: FulfillmentMockDeps): MockShipment | null {
  const existing = deps.fulfillment.shipments.get(orderId)
  if (existing) return existing
  const order = deps.orders.orders.get(orderId)
  if (!order || order.status !== 'CONFIRMED') return null
  const shipment: MockShipment = {
    orderId,
    trackingCode: `SIM-${orderId}`,
    events: [
      { time: order.confirmedAt ?? order.createdAt, label: 'Order confirmed', status: 'CONFIRMED' },
      { time: iso(deps.now()), label: 'We are packing your order', status: 'PACKING' },
    ],
    seenEventIds: new Set(),
    returnWindowEndsAt: null,
  }
  deps.fulfillment.shipments.set(orderId, shipment)
  return shipment
}

const trackingView = (shipment: MockShipment) => ({
  orderId: shipment.orderId,
  status: latest(shipment).status,
  carrier: CARRIER,
  trackingCode: shipment.trackingCode,
  events: shipment.events,
  returnWindowEndsAt: shipment.returnWindowEndsAt,
})

function applyCarrierEvent(body: Record<string, unknown>, deps: FulfillmentMockDeps): MockResponse {
  const event = typeof body.event === 'string' ? body.event : ''
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!(event in CARRIER_FLOW))
    return invalid('event', 'event must be IN_TRANSIT, DELIVERED or DELIVERY_FAILED')
  if (!eventId) return invalid('eventId', 'eventId is required')
  if (event === 'DELIVERY_FAILED' && !reason)
    return invalid('reason', 'A failed delivery needs a reason')

  const shipment = shipmentOf(orderId, deps)
  if (!shipment) return failure(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found')
  if (shipment.seenEventIds.has(eventId))
    return ok({ duplicate: true, status: latest(shipment).status }, 'Notice already applied')
  if (!CARRIER_FLOW[event].includes(latest(shipment).status))
    return failure(
      409,
      'INVALID_TRANSITION',
      `A shipment that is ${latest(shipment).status} cannot be ${event}`
    )

  const time = deps.now()
  shipment.seenEventIds.add(eventId)
  shipment.events.push({
    time: iso(time),
    label: CARRIER_LABELS[event],
    status: event as MockStatus,
    ...(event === 'DELIVERY_FAILED' && { reason }),
  })
  if (event === 'DELIVERED') shipment.returnWindowEndsAt = iso(time + RETURN_WINDOW_DAYS * DAY_MS)
  return ok({ duplicate: false, status: event }, 'Notice applied')
}

/** Returns a response for a tracking or carrier simulator endpoint, or null for any other request. */
export function handleFulfillmentMock(
  request: MockRequest,
  userId: string | null,
  deps: FulfillmentMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const read = method === 'GET' ? path.match(/^\/orders\/([^/]+)\/tracking$/) : null
  const isCarrier = method === 'POST' && path === '/carrier/simulator/events'
  if (!read && !isCarrier) return null

  if (isCarrier) {
    const body =
      request.body !== null && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>)
        : {}
    return applyCarrierEvent(body, deps)
  }

  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  const orderId = decodeURIComponent(read![1])
  const order = deps.orders.orders.get(orderId)
  if (!order || order.userId !== userId) return failure(404, 'ORDER_NOT_FOUND', 'Order not found')
  const shipment = shipmentOf(orderId, deps)
  if (!shipment) return failure(404, 'TRACKING_NOT_FOUND', 'This order has no shipment yet')
  return ok(trackingView(shipment), 'Tracking retrieved')
}
