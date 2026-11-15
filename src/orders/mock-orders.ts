import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { findAddress, getMockAddressState, type MockAddressState } from '@/addresses/mock-addresses'
import { getMockState } from '@/auth/mock-iam'
import { getMockCartState, type MockCartState } from '@/cart/mock-cart'
import { getMockQuoteState, type MockQuoteState } from '@/checkout/mock-checkout'

/** Place order, payment simulator and order read parts of the in-app mock backend (/mock-api). Mirrors the real order and payment services' wire contract (P5-T14). */

export const UNKNOWN_WINDOW_MS = 30 * 60 * 1000
const RESERVATION_MS = 10 * 60 * 1000
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export interface MockOrder {
  orderId: string
  userId: string
  /** Full customer name, for the backoffice mock to mask. Never sent to the customer. */
  customerName: string
  quoteId: string
  status:
    | 'RESERVED'
    | 'CONFIRMED'
    | 'IN_FULFILLMENT'
    | 'CANCEL_REQUESTED'
    | 'CANCELLED'
    | 'DELIVERED'
    | 'UNKNOWN_HOLD'
    | 'FAILED_CLOSED'
  paymentStatus: 'PROCESSING' | 'UNKNOWN_30M' | 'CAPTURED' | 'FAILED' | 'REFUND_PENDING'
  failureCode: string | null
  totalPayableVnd: number
  paymentAttemptId: string
  createdAt: string
  /** When the payment was captured and the order confirmed (set by the mock; the real service keeps it in its history). */
  confirmedAt?: string
  expiresAt: string
  /** When an unknown payment stops holding the stock (30 minutes); internal, the real service keeps it as a timer. */
  unknownDeadline: string | null
  refundObligationVnd: number
  /** Where the refund owed for a cancellation stands; the real services keep it with the payment. */
  refundStatus?: 'PENDING' | 'COMPLETED'
  /** The customer's cancellation request (P7). */
  cancellation?: { status: 'REQUESTED' | 'CONFIRMED' | 'REFUSED'; reason: string }
  /** The commercial snapshot (I04): copied from the quote and the address at placement, never updated. */
  snapshot: {
    subtotalVnd: number
    discountVnd: number
    shippingFeeVnd: number
    voucherCode: string | null
    address: Record<string, unknown> | null
    lines: Array<Record<string, unknown>>
  }
}

export interface MockOrderState {
  counter: number
  orders: Map<string, MockOrder>
  /** `${userId}|${idempotencyKey}` -> the order that key created. */
  keys: Map<string, string>
}

export const createMockOrderState = (): MockOrderState => ({
  counter: 0,
  orders: new Map(),
  keys: new Map(),
})

const globalForOrders = globalThis as unknown as { __mockOrderState?: MockOrderState }

export function getMockOrderState(): MockOrderState {
  globalForOrders.__mockOrderState ??= createMockOrderState()
  return globalForOrders.__mockOrderState
}

export interface OrderMockDeps {
  orders: MockOrderState
  quotes: MockQuoteState
  carts: MockCartState
  addresses: MockAddressState
  /** The display name of a customer (the identity mock in the app, a stub in tests). */
  customerName: (userId: string) => string
  now: () => number
}

const defaultDeps = (): OrderMockDeps => ({
  orders: getMockOrderState(),
  quotes: getMockQuoteState(),
  carts: getMockCartState(),
  addresses: getMockAddressState(),
  customerName: (userId) => getMockState().users.get(userId)?.name ?? 'Customer',
  now: Date.now,
})

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
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

const itemCountOf = (order: MockOrder) =>
  order.snapshot.lines.reduce((sum, line) => sum + Number(line.quantity), 0)

/** The order as POST /orders returns it (a real order carries more internal fields that nothing reads). */
const view = (order: MockOrder) => ({
  orderId: order.orderId,
  status: order.status,
  paymentStatus: order.paymentStatus,
  ...(order.failureCode && { failureCode: order.failureCode }),
  subtotalVnd: order.snapshot.subtotalVnd,
  discountVnd: order.snapshot.discountVnd,
  shippingFeeVnd: order.snapshot.shippingFeeVnd,
  totalPayableVnd: order.totalPayableVnd,
  items: order.snapshot.lines,
  expiresAt: order.expiresAt,
  createdAt: order.createdAt,
  paymentAttemptId: order.paymentAttemptId,
})

/** One row of GET /orders. */
const summary = (order: MockOrder) => ({
  orderId: order.orderId,
  status: order.status,
  paymentStatus: order.paymentStatus,
  ...(order.failureCode && { failureCode: order.failureCode }),
  ...(order.snapshot.voucherCode && { voucherCode: order.snapshot.voucherCode }),
  totalPayableVnd: order.totalPayableVnd,
  itemCount: itemCountOf(order),
  expiresAt: order.expiresAt,
  createdAt: order.createdAt,
  updatedAt: order.createdAt,
})

const paymentOf = (order: MockOrder) => ({
  attemptId: order.paymentAttemptId,
  status: order.paymentStatus,
  expectedAmountVnd: order.totalPayableVnd,
  capturedAmountVnd:
    order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'REFUND_PENDING'
      ? order.totalPayableVnd
      : 0,
})

const refundOf = (order: MockOrder) =>
  order.refundObligationVnd > 0
    ? { amountVnd: order.refundObligationVnd, status: order.refundStatus ?? 'PENDING' }
    : null

/** GET /orders/{id}: the summary, the frozen snapshot, the payment and any refund owed. */
const detail = (order: MockOrder) => ({
  ...summary(order),
  quoteId: order.quoteId,
  subtotalVnd: order.snapshot.subtotalVnd,
  discountVnd: order.snapshot.discountVnd,
  shippingFeeVnd: order.snapshot.shippingFeeVnd,
  items: order.snapshot.lines,
  shippingAddress: order.snapshot.address,
  payment: paymentOf(order),
  refundObligation: refundOf(order),
  ...(order.cancellation && { cancellation: { status: order.cancellation.status } }),
})

/** What POST /payments/simulator/{id}/outcome answers: the payment attempt, not the order. */
const attemptView = (order: MockOrder) => ({
  attemptId: order.paymentAttemptId,
  orderId: order.orderId,
  amountVnd: order.totalPayableVnd,
  capturedAmountVnd: paymentOf(order).capturedAmountVnd,
  status: order.paymentStatus,
  createdAt: order.createdAt,
})

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

/** A payment that stayed unknown for 30 minutes closes the order. Evaluated whenever the order is read. */
function settle(order: MockOrder, now: number): void {
  if (
    order.status === 'UNKNOWN_HOLD' &&
    order.unknownDeadline &&
    now > Date.parse(order.unknownDeadline)
  ) {
    order.status = 'FAILED_CLOSED'
    order.failureCode = 'PAYMENT_UNKNOWN_EXPIRED'
  }
}

const OUTCOMES = new Set(['CAPTURED', 'FAILED', 'UNKNOWN'])

function applyOutcome(order: MockOrder, outcome: string, deps: OrderMockDeps): MockResponse {
  const now = deps.now()
  settle(order, now)

  if (order.status === 'RESERVED' || order.status === 'UNKNOWN_HOLD') {
    if (outcome === 'CAPTURED') {
      order.status = 'CONFIRMED'
      order.paymentStatus = 'CAPTURED'
      order.confirmedAt = new Date(now).toISOString()
      order.unknownDeadline = null
      deps.carts.carts.delete(order.userId)
    } else if (outcome === 'FAILED') {
      order.status = 'FAILED_CLOSED'
      order.paymentStatus = 'FAILED'
      order.failureCode = 'PAYMENT_FAILED'
      order.unknownDeadline = null
    } else if (order.status === 'RESERVED') {
      order.status = 'UNKNOWN_HOLD'
      order.paymentStatus = 'UNKNOWN_30M'
      order.unknownDeadline = new Date(now + UNKNOWN_WINDOW_MS).toISOString()
    }
  } else if (
    order.status === 'FAILED_CLOSED' &&
    order.failureCode === 'PAYMENT_UNKNOWN_EXPIRED' &&
    order.paymentStatus === 'UNKNOWN_30M' &&
    outcome === 'CAPTURED'
  ) {
    // Money after the order closed: the order is not restored, the customer is owed a refund.
    order.paymentStatus = 'REFUND_PENDING'
    order.refundObligationVnd = order.totalPayableVnd
  }
  return ok(attemptView(order), 'Outcome recorded')
}

function snapshotAddress(deps: OrderMockDeps, userId: string, addressId: unknown) {
  const address =
    typeof addressId === 'string' ? findAddress(deps.addresses, userId, addressId) : undefined
  if (!address) return null
  const { recipient, phone, line1, ward, district, province } = address
  return { recipient, phone, line1, ward, district, province }
}

/** Every order in the mock, newest first. Used by the backoffice mock. */
export const allOrdersNewestFirst = (state: MockOrderState): MockOrder[] =>
  [...state.orders.values()].reverse()

export { detail as orderDetailView, summary as orderSummaryView, settle as settleOrder }

/** Returns a response for an order or payment simulator endpoint, or null for any other request. */
export function handleOrderMock(
  request: MockRequest,
  userId: string | null,
  deps: OrderMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const isPlace = method === 'POST' && path === '/orders'
  const read = method === 'GET' ? path.match(/^\/orders\/([^/]+)$/) : null
  const isList = method === 'GET' && path === '/orders'
  const simulator =
    method === 'POST' ? path.match(/^\/payments\/simulator\/([^/]+)\/outcome$/) : null
  if (!isPlace && !isList && !read && !simulator) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  const { orders } = deps

  if (isList) {
    const limit = Number(request.query?.limit ?? DEFAULT_LIMIT)
    const page = Number(request.query?.page ?? 1)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      return invalid('limit', `limit must be between 1 and ${MAX_LIMIT}`)
    if (!Number.isInteger(page) || page < 1) return invalid('page', 'page must be 1 or more')
    const mine = [...orders.orders.values()].filter((order) => order.userId === userId).reverse()
    mine.forEach((order) => settle(order, deps.now()))
    const rows = mine.slice((page - 1) * limit, page * limit).map(summary)
    return {
      status: 200,
      body: {
        message: 'Orders retrieved',
        data: rows,
        metadata: {
          total: mine.length,
          page,
          pageCount: Math.max(1, Math.ceil(mine.length / limit)),
          limit,
        },
      },
    }
  }

  if (read) {
    const order = orders.orders.get(decodeURIComponent(read[1]))
    if (!order || order.userId !== userId) return failure(404, 'ORDER_NOT_FOUND', 'Order not found')
    settle(order, deps.now())
    return ok(detail(order))
  }

  if (simulator) {
    const attemptId = decodeURIComponent(simulator[1])
    const order = [...orders.orders.values()].find((entry) => entry.paymentAttemptId === attemptId)
    if (!order || order.userId !== userId)
      return failure(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found')
    if (typeof body.outcome !== 'string' || !OUTCOMES.has(body.outcome))
      return invalid('outcome', 'outcome must be CAPTURED, FAILED or UNKNOWN')
    return applyOutcome(order, body.outcome, deps)
  }

  const key = request.idempotencyKey ?? ''
  if (!KEY_PATTERN.test(key))
    return invalid('Idempotency-Key', 'Send an Idempotency-Key of 1 to 128 safe characters')
  const unknown = Object.keys(body).filter((field) => field !== 'quoteId')
  if (unknown.length > 0) return invalid(unknown[0], 'Unknown field')
  if (typeof body.quoteId !== 'string' || !body.quoteId)
    return invalid('quoteId', 'quoteId is required')

  // A key that was used before replays its order (or conflicts) before anything else is checked.
  const replayedId = orders.keys.get(`${userId}|${key}`)
  if (replayedId) {
    const existing = orders.orders.get(replayedId)!
    if (existing.quoteId !== body.quoteId)
      return failure(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request'
      )
    settle(existing, deps.now())
    return ok(view(existing), 'Order already placed')
  }

  const quote = deps.quotes.stored?.get(body.quoteId)
  if (!quote || quote.userId !== userId) return failure(404, 'QUOTE_NOT_FOUND', 'Quote not found')
  if (deps.now() > Date.parse(quote.expiresAt))
    return failure(409, 'QUOTE_EXPIRED', 'The quote has expired')

  orders.counter += 1
  const orderId = `O-${String(orders.counter).padStart(3, '0')}`
  const order: MockOrder = {
    orderId,
    userId,
    customerName: deps.customerName(userId),
    quoteId: quote.quoteId,
    status: 'RESERVED',
    paymentStatus: 'PROCESSING',
    failureCode: null,
    totalPayableVnd: quote.totalPayableVnd,
    paymentAttemptId: `PAY-${orderId}`,
    createdAt: new Date(deps.now()).toISOString(),
    expiresAt: new Date(deps.now() + RESERVATION_MS).toISOString(),
    unknownDeadline: null,
    refundObligationVnd: 0,
    snapshot: {
      subtotalVnd: Number(quote.subtotalVnd ?? 0),
      discountVnd: Number(quote.discountVnd ?? 0),
      shippingFeeVnd: Number(quote.shippingFeeVnd ?? 0),
      voucherCode: typeof quote.voucherCode === 'string' ? quote.voucherCode : null,
      address: snapshotAddress(deps, userId, quote.addressId),
      lines: Array.isArray(quote.lines)
        ? quote.lines.map((line: Record<string, unknown>) => ({ ...line, imageUrl: null }))
        : [],
    },
  }
  orders.orders.set(orderId, order)
  orders.keys.set(`${userId}|${key}`, orderId)
  return ok(view(order), 'Order placed', 201)
}
