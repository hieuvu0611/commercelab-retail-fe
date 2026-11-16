import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { getMockOrderState, type MockOrder, type MockOrderState } from '@/orders/mock-orders'
import type { ShipmentStatus, TrackingStatus } from '@/types/fulfillment'
import { getMockReturnsState, heldQuantity } from '@/returns/mock-returns-state'

/** Tracking and carrier simulator parts of the in-app mock backend (/mock-api). The wire shapes follow the real services (see src/types/fulfillment.ts). */

export const RETURN_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type MockStatus = TrackingStatus

interface MockEvent {
  time: string
  label: string
  status: MockStatus
  reason?: string
}

export interface MockShipmentLine {
  skuId: string
  skuName: string
  orderedQuantity: number
  pickedQuantity: number
}

export interface MockShipment {
  shipmentId: string
  orderId: string
  warehouseId: string
  status: ShipmentStatus
  /** Raised by every change; a request carrying an older one is refused. */
  version: number
  lines: MockShipmentLine[]
  createdAt: string
  handedOverAt: string | null
  shortage: { skuId: string; reason: string } | null
  events: MockEvent[]
  /** Carrier notice ids already applied: a repeated notice changes nothing. */
  seenEventIds: Set<string>
  returnWindowEndsAt: string | null
}

export interface MockFulfillmentState {
  shipments: Map<string, MockShipment>
}

export const createMockFulfillmentState = (): MockFulfillmentState => ({ shipments: new Map() })

function seedShipmentIfEmpty(state: MockFulfillmentState) {
  if (state.shipments.size > 0) return
  const at = new Date(Date.now() - 2 * 86400 * 1000).toISOString()
  const returnWindowEndsAt = new Date(Date.now() + 5 * 86400 * 1000).toISOString()
  state.shipments.set('O-001', {
    shipmentId: 'SHP-O-001',
    orderId: 'O-001',
    warehouseId: 'WH-HCM-01',
    status: 'DELIVERED',
    version: 1,
    handedOverAt: at,
    returnWindowEndsAt,
    lines: [
      {
        skuId: 'BP-1',
        skuName: 'Backpack Explorer 25L',
        orderedQuantity: 2,
        pickedQuantity: 2,
      },
    ],
    events: [
      { time: at, status: 'DELIVERED', label: 'Delivered' },
      { time: at, status: 'HANDED_OVER', label: 'Handed to carrier' },
      { time: at, status: 'PACKED', label: 'Packed' },
    ],
    createdAt: at,
    shortage: null,
    seenEventIds: new Set(),
  })
}

const globalForFulfillment = globalThis as unknown as {
  __mockFulfillmentState?: MockFulfillmentState
}

export function getMockFulfillmentState(): MockFulfillmentState {
  globalForFulfillment.__mockFulfillmentState ??= createMockFulfillmentState()
  seedShipmentIfEmpty(globalForFulfillment.__mockFulfillmentState)
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

/** What each carrier notice may follow: the carrier never moves a parcel it was not handed. */
const CARRIER_FLOW: Record<string, readonly ShipmentStatus[]> = {
  IN_TRANSIT: ['HANDED_OVER'],
  DELIVERED: ['IN_TRANSIT'],
  DELIVERY_FAILED: ['IN_TRANSIT'],
}

const CARRIER_LABELS: Record<string, string> = {
  IN_TRANSIT: 'Your parcel is on its way',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery attempt failed',
}

export const isoTime = (ms: number) => new Date(ms).toISOString()

/** The first slice has two warehouses; the mock sends odd order numbers to Ho Chi Minh City and even ones to Hanoi. */
export function mockWarehouseOf(orderId: string): string {
  const number = Number(orderId.replace(/\D/g, ''))
  return number % 2 === 1 ? 'WH-HCM-01' : 'WH-HN-01'
}

const toLine = (raw: Record<string, unknown>): MockShipmentLine => ({
  skuId: String(raw.skuId ?? ''),
  skuName: String(raw.skuName ?? raw.skuId ?? ''),
  orderedQuantity: Number(raw.quantity ?? 0),
  pickedQuantity: 0,
})

function createShipment(order: MockOrder, deps: FulfillmentMockDeps): MockShipment {
  return {
    shipmentId: `SHP-${order.orderId}`,
    orderId: order.orderId,
    warehouseId: mockWarehouseOf(order.orderId),
    status: 'PENDING_PICK',
    version: 1,
    lines: order.snapshot.lines.map(toLine),
    createdAt: isoTime(deps.now()),
    handedOverAt: null,
    shortage: null,
    events: [
      { time: order.confirmedAt ?? order.createdAt, label: 'Order confirmed', status: 'CONFIRMED' },
    ],
    seenEventIds: new Set(),
    returnWindowEndsAt: null,
  }
}

/**
 * A confirmed order gets its shipment and moves to IN_FULFILLMENT (the real services do both from the OrderConfirmed
 * event; the mock does it whenever anything asks). Doing it again changes nothing.
 */
export function syncShipments(deps: FulfillmentMockDeps): void {
  for (const order of deps.orders.orders.values()) {
    if (order.status !== 'CONFIRMED' || deps.fulfillment.shipments.has(order.orderId)) continue
    deps.fulfillment.shipments.set(order.orderId, createShipment(order, deps))
    order.status = 'IN_FULFILLMENT'
  }
}

/** Records one change: the version goes up and the customer's timeline gets an entry. */
export function recordChange(
  shipment: MockShipment,
  status: ShipmentStatus,
  event: { label: string; status: MockStatus; reason?: string } | null,
  nowMs: number
): void {
  shipment.status = status
  shipment.version += 1
  if (event) shipment.events.push({ time: isoTime(nowMs), ...event })
}

function shipmentOf(orderId: string, deps: FulfillmentMockDeps): MockShipment | null {
  syncShipments(deps)
  return deps.fulfillment.shipments.get(orderId) ?? null
}

const ENTRY_TYPES: Partial<Record<MockStatus, string>> = {
  CONFIRMED: 'CREATED',
  PICKING: 'PICKING_STARTED',
}

/** The customer's tracking as the service sends it. */
const trackingView = (shipment: MockShipment) => ({
  orderId: shipment.orderId,
  shipmentId: shipment.shipmentId,
  status: shipment.status,
  ...(shipment.handedOverAt && { handedOverAt: shipment.handedOverAt }),
  ...(shipment.returnWindowEndsAt && { returnWindowEndsAt: shipment.returnWindowEndsAt }),
  quantities: shipment.lines.map((line) => ({
    skuId: line.skuId,
    ordered: line.orderedQuantity,
    dispatched: shipment.handedOverAt ? line.pickedQuantity : 0,
    delivered: shipment.status === 'DELIVERED' ? line.pickedQuantity : 0,
    returned: heldQuantity(getMockReturnsState(), shipment.orderId, line.skuId),
  })),
  timeline: shipment.events.map((event) => ({
    at: event.time,
    type: ENTRY_TYPES[event.status] ?? event.status,
    message: event.reason ? `${event.label}: ${event.reason}` : event.label,
  })),
})

function applyCarrierEvent(body: Record<string, unknown>, deps: FulfillmentMockDeps): MockResponse {
  const event = typeof body.type === 'string' ? body.type : ''
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  const shipmentId = typeof body.shipmentId === 'string' ? body.shipmentId : ''
  const orderId = shipmentId.replace(/^SHP-/, '')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!(event in CARRIER_FLOW))
    return invalid('type', 'type must be IN_TRANSIT, DELIVERED or DELIVERY_FAILED')
  if (!eventId) return invalid('eventId', 'eventId is required')
  if (event === 'DELIVERY_FAILED' && !reason)
    return invalid('reason', 'A failed delivery needs a reason')

  const shipment = shipmentOf(orderId, deps)
  if (!shipment) return failure(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found')
  if (shipment.seenEventIds.has(eventId) || shipment.events.some((entry) => entry.status === event))
    return ok(
      { status: shipment.status, applied: false, duplicate: true },
      'Notice already applied'
    )
  if (!CARRIER_FLOW[event].includes(shipment.status))
    return failure(
      409,
      'SHIPMENT_NOT_DISPATCHED',
      `A shipment that is ${shipment.status} cannot be ${event}`
    )

  const time = deps.now()
  shipment.seenEventIds.add(eventId)
  recordChange(
    shipment,
    event as ShipmentStatus,
    {
      label: CARRIER_LABELS[event],
      status: event as MockStatus,
      ...(event === 'DELIVERY_FAILED' && { reason }),
    },
    time
  )
  if (event === 'DELIVERED') {
    shipment.returnWindowEndsAt = isoTime(time + RETURN_WINDOW_DAYS * DAY_MS)
    const order = deps.orders.orders.get(orderId)
    if (order) order.status = 'DELIVERED'
  }
  return ok({ status: event, applied: true, duplicate: false }, 'Notice applied')
}

/** Returns a response for a tracking or carrier simulator endpoint, or null for any other request. */
export function handleFulfillmentMock(
  request: MockRequest,
  userId: string | null,
  deps: FulfillmentMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const read = method === 'GET' ? path.match(/^\/orders\/([^/]+)\/tracking$/) : null
  const isCarrier = method === 'POST' && path === '/shipments/webhooks/carrier'
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
