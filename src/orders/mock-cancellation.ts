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

export interface MockCancellationState {
  counter: number
  alerts: Map<string, MockStopAlert>
}

export const createMockCancellationState = (): MockCancellationState => ({
  counter: 0,
  alerts: new Map(),
})

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
      return done('Cancellation already requested')
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
    return done('Cancellation requested: waiting for the warehouse to stop the parcel')
  }
  return failure(
    409,
    'ORDER_ALREADY_HANDED_OVER',
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
