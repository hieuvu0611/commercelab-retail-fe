import type { MockRequest, MockResponse } from '@/auth/mock-api'
import {
  isoTime,
  getMockFulfillmentState,
  recordChange,
  syncShipments,
  type MockFulfillmentState,
  type MockShipment,
} from '@/fulfillment/mock-fulfillment'
import { CANCEL_REASONS } from '@/types/cancellation'
import {
  getMockOrderState,
  orderDetailView,
  type MockOrder,
  type MockOrderState,
} from './mock-orders'

/**
 * Customer cancellation of the in-app mock backend (/mock-api), following the matrix of B05: unpaid and paid-but-not-picked
 * orders are cancelled at once, an order being picked or packed waits for the warehouse (a stop alert is opened), and a
 * parcel that left is refused. The wire shapes are a provisional reading of P7-T01/T02 (see src/types/cancellation.ts).
 */

export interface MockStopAlert {
  alertId: string
  orderId: string
  shipmentId: string
  warehouseId: string
  reason: string
  status: 'OPEN' | 'STOPPED' | 'HANDED_OVER'
  createdAt: string
  resolvedAt: string | null
}

/** What the alert stream carries: a new open alert, or an alert that ended (its status says how). */
export interface MockStopEvent {
  type: 'stop_requested' | 'stop_resolved'
  alert: MockStopAlert
}

export interface MockCancellationState {
  counter: number
  alerts: Map<string, MockStopAlert>
  /** Open alert streams (the mock notification service) waiting for events. */
  listeners: Set<(event: MockStopEvent) => void>
}

export const createMockCancellationState = (): MockCancellationState => ({
  counter: 0,
  alerts: new Map(),
  listeners: new Set(),
})

const publish = (state: MockCancellationState, type: MockStopEvent['type'], alert: MockStopAlert) =>
  state.listeners.forEach((listener) => listener({ type, alert }))

/** The open alerts of one warehouse: what a stream replays to a subscriber that connects late. */
export const openAlertsFor = (state: MockCancellationState, warehouseId: string): MockStopAlert[] =>
  [...state.alerts.values()].filter(
    (alert) => alert.status === 'OPEN' && alert.warehouseId === warehouseId
  )

/** The event data as the stream sends it. */
export const eventPayload = ({ type, alert }: MockStopEvent) => ({
  orderId: alert.orderId,
  shipmentId: alert.shipmentId,
  warehouseId: alert.warehouseId,
  ...(type === 'stop_requested'
    ? { requestedAt: alert.createdAt }
    : { outcome: alert.status === 'OPEN' ? undefined : alert.status }),
})

const WAREHOUSE_ROLES: readonly string[] = ['WAREHOUSE_STAFF', 'WAREHOUSE_MGR']

/** Who may open a warehouse's alert stream: warehouse staff of that warehouse (or of all), nobody else. */
export function streamAccess(
  caller: { roles: string[]; warehouseScopes: string[] } | null,
  warehouseId: string
): 200 | 401 | 403 {
  if (!caller) return 401
  if (!caller.roles.some((role) => WAREHOUSE_ROLES.includes(role))) return 403
  const inScope =
    caller.warehouseScopes.includes('ALL') || caller.warehouseScopes.includes(warehouseId)
  return inScope ? 200 : 403
}

const globalForCancellation = globalThis as unknown as {
  __mockCancellationState?: MockCancellationState
}

export function getMockCancellationState(): MockCancellationState {
  globalForCancellation.__mockCancellationState ??= createMockCancellationState()
  return globalForCancellation.__mockCancellationState
}

export interface CancellationMockDeps {
  orders: MockOrderState
  fulfillment: MockFulfillmentState
  cancellations: MockCancellationState
  now: () => number
}

const defaultDeps = (): CancellationMockDeps => ({
  orders: getMockOrderState(),
  fulfillment: getMockFulfillmentState(),
  cancellations: getMockCancellationState(),
  now: Date.now,
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

/** Before the parcel is picked, or when its picking is blocked: nothing is on its way, so the stop needs no confirmation. */
const STOPPABLE_AT_ONCE = new Set(['PENDING_PICK', 'PICK_BLOCKED'])
/** Being picked or packed: the warehouse has to confirm the stop before it counts. */
const NEEDS_WAREHOUSE = new Set(['PICKING', 'PACKED'])

/**
 * Closes a paid order as cancelled: the parcel is stopped (its stock goes back on the shelf), the whole amount paid
 * (shipping included) becomes a pending refund. Only ever applied once: a repeat finds the order already cancelled.
 */
export function cancelAndRefund(
  order: MockOrder,
  shipment: MockShipment | null,
  nowMs: number
): void {
  if (shipment && shipment.status !== 'STOPPED_FOR_CANCEL')
    recordChange(
      shipment,
      'STOPPED_FOR_CANCEL',
      { label: 'Shipment stopped because the order was cancelled', status: 'STOPPED_FOR_CANCEL' },
      nowMs
    )
  order.status = 'CANCELLED'
  order.cancellation = { status: 'CONFIRMED', reason: order.cancellation?.reason ?? '' }
  if (order.refundObligationVnd === 0) {
    order.refundObligationVnd = order.totalPayableVnd
    order.refundStatus = 'PENDING'
    order.paymentStatus = 'REFUND_PENDING'
  }
}

function openStopAlert(
  order: MockOrder,
  shipment: MockShipment,
  reason: string,
  deps: CancellationMockDeps
): void {
  const { cancellations } = deps
  cancellations.counter += 1
  const alertId = `ALERT-${String(cancellations.counter).padStart(3, '0')}`
  cancellations.alerts.set(alertId, {
    alertId,
    orderId: order.orderId,
    shipmentId: shipment.shipmentId,
    warehouseId: shipment.warehouseId,
    reason,
    status: 'OPEN',
    createdAt: isoTime(deps.now()),
    resolvedAt: null,
  })
  publish(cancellations, 'stop_requested', cancellations.alerts.get(alertId)!)
}

const openAlertOf = (shipment: MockShipment, state: MockCancellationState) =>
  [...state.alerts.values()].find(
    (alert) => alert.shipmentId === shipment.shipmentId && alert.status === 'OPEN'
  )

const LEFT_WAREHOUSE = new Set([
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PARTIALLY_DELIVERED',
])

/**
 * SC06 branch A: the warehouse confirms the stop. Returns null when the shipment is now stopped (also when it already
 * was: repeating changes nothing), or the refusal. The handover winning first is a 409.
 */
export function confirmStopShipment(
  shipment: MockShipment,
  deps: CancellationMockDeps
): MockResponse | null {
  if (shipment.status === 'STOPPED_FOR_CANCEL') return null
  if (LEFT_WAREHOUSE.has(shipment.status))
    return failure(
      409,
      'SHIPMENT_ALREADY_HANDED_OVER',
      'The parcel was handed over before the stop: the cancellation is refused'
    )
  const alert = openAlertOf(shipment, deps.cancellations)
  const order = deps.orders.orders.get(shipment.orderId)
  if (!alert || !order)
    return failure(409, 'NO_STOP_REQUEST', 'No customer cancellation is waiting for this shipment')
  const nowMs = deps.now()
  cancelAndRefund(order, shipment, nowMs)
  alert.status = 'STOPPED'
  alert.resolvedAt = isoTime(nowMs)
  publish(deps.cancellations, 'stop_resolved', alert)
  return null
}

/**
 * SC06 branch B: the handover took effect while a stop was still open. The cancellation is refused, the order goes back
 * to fulfilment and no refund is owed. Does nothing when no stop is open.
 */
export function resolveStopByHandover(shipment: MockShipment, deps: CancellationMockDeps): void {
  const alert = openAlertOf(shipment, deps.cancellations)
  const order = deps.orders.orders.get(shipment.orderId)
  if (!alert || !order) return
  order.status = 'IN_FULFILLMENT'
  order.cancellation = { status: 'REFUSED', reason: order.cancellation?.reason ?? '' }
  alert.status = 'HANDED_OVER'
  alert.resolvedAt = isoTime(deps.now())
  publish(deps.cancellations, 'stop_resolved', alert)
}

function decide(order: MockOrder, reason: string, deps: CancellationMockDeps): MockResponse {
  const done = (message: string): MockResponse => ({
    status: 200,
    body: { message, data: orderDetailView(order) },
  })
  switch (order.status) {
    case 'CANCELLED':
      return done('Order already cancelled')
    case 'CANCEL_REQUESTED':
      return {
        status: 202,
        body: { message: 'Cancellation already requested', data: orderDetailView(order) },
      }
    case 'RESERVED':
      order.status = 'CANCELLED'
      order.cancellation = { status: 'CONFIRMED', reason }
      return done('Order cancelled')
    case 'UNKNOWN_HOLD':
      return failure(
        409,
        'PAYMENT_UNRESOLVED',
        'The payment result is unknown: wait for it before cancelling'
      )
    case 'CONFIRMED':
    case 'IN_FULFILLMENT':
      break
    default:
      return failure(
        409,
        'ORDER_NOT_CANCELLABLE',
        `An order that is ${order.status} cannot be cancelled`
      )
  }

  const shipment = deps.fulfillment.shipments.get(order.orderId) ?? null
  if (!shipment || STOPPABLE_AT_ONCE.has(shipment.status)) {
    order.cancellation = { status: 'REQUESTED', reason }
    cancelAndRefund(order, shipment, deps.now())
    return done('Order cancelled')
  }
  if (NEEDS_WAREHOUSE.has(shipment.status)) {
    order.status = 'CANCEL_REQUESTED'
    order.cancellation = { status: 'REQUESTED', reason }
    openStopAlert(order, shipment, reason, deps)
    return {
      status: 202,
      body: {
        message: 'Cancellation requested: waiting for the warehouse to stop the parcel',
        data: orderDetailView(order),
      },
    }
  }
  return failure(
    409,
    'ORDER_HANDED_OVER',
    'The parcel was already handed to the carrier: use a return after delivery'
  )
}

/** Returns a response for a cancellation endpoint, or null for any other request. */
export function handleCancellationMock(
  request: MockRequest,
  userId: string | null,
  deps: CancellationMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const cancel = method === 'POST' ? path.match(/^\/orders\/([^/]+)\/cancel$/) : null
  if (!cancel) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  const order = deps.orders.orders.get(decodeURIComponent(cancel[1]))
  if (!order || order.userId !== userId) return failure(404, 'ORDER_NOT_FOUND', 'Order not found')

  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  const reason = CANCEL_REASONS.find((entry) => entry.code === body.reason)?.code
  if (!reason)
    return failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', {
      reason: [`reason must be one of ${CANCEL_REASONS.map((entry) => entry.code).join(', ')}`],
    })

  syncShipments(deps)
  return decide(order, reason, deps)
}
