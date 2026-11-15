import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { findAddress, getMockAddressState, type MockAddressState } from '@/addresses/mock-addresses'
import { getMockCartState, type MockCartState } from '@/cart/mock-cart'
import { getMockQuoteState, type MockQuoteState } from '@/checkout/mock-checkout'

/** Place order, payment simulator and order read parts of the in-app mock backend (/mock-api). Mirrors P5-T04/T05/T09. */

export const UNKNOWN_WINDOW_MS = 30 * 60 * 1000
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export interface MockOrder {
  orderId: string
  userId: string
  quoteId: string
  status: 'RESERVED' | 'CONFIRMED' | 'UNKNOWN_HOLD' | 'FAILED_CLOSED'
  paymentStatus: 'PROCESSING' | 'UNKNOWN' | 'CAPTURED' | 'FAILED' | 'EXPIRED_30M' | 'CAPTURED_LATE'
  failureCode: string | null
  totalPayableVnd: number
  paymentAttemptId: string
  createdAt: string
  unknownDeadline: string | null
  refundObligationVnd: number
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
  now: () => number
}

const defaultDeps = (): OrderMockDeps => ({
  orders: getMockOrderState(),
  quotes: getMockQuoteState(),
  carts: getMockCartState(),
  addresses: getMockAddressState(),
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

const view = ({ userId: _userId, quoteId: _quoteId, snapshot: _snapshot, ...order }: MockOrder) =>
  order

const detail = (order: MockOrder) => ({ ...view(order), ...order.snapshot })

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
    order.paymentStatus = 'EXPIRED_30M'
    order.failureCode = 'PAYMENT_UNKNOWN_EXPIRED'
  }
}

const OUTCOMES = new Set(['CAPTURED', 'FAILED', 'UNKNOWN', 'LATE'])

function applyOutcome(order: MockOrder, outcome: string, deps: OrderMockDeps): MockResponse {
  const now = deps.now()
  settle(order, now)

  if (outcome === 'LATE') {
    if (order.status !== 'UNKNOWN_HOLD' && order.paymentStatus !== 'EXPIRED_30M')
      return failure(409, 'PAYMENT_NOT_UNKNOWN', 'Only an unknown payment can arrive late')
    // Development shortcut: skip the clock past the window, then the money arrives.
    order.unknownDeadline = new Date(now - 1).toISOString()
    settle(order, now)
    return applyOutcome(order, 'CAPTURED', deps)
  }

  if (order.status === 'RESERVED' || order.status === 'UNKNOWN_HOLD') {
    if (outcome === 'CAPTURED') {
      order.status = 'CONFIRMED'
      order.paymentStatus = 'CAPTURED'
      order.unknownDeadline = null
      deps.carts.carts.delete(order.userId)
    } else if (outcome === 'FAILED') {
      order.status = 'FAILED_CLOSED'
      order.paymentStatus = 'FAILED'
      order.failureCode = 'PAYMENT_FAILED'
      order.unknownDeadline = null
    } else if (order.status === 'RESERVED') {
      order.status = 'UNKNOWN_HOLD'
      order.paymentStatus = 'UNKNOWN'
      order.unknownDeadline = new Date(now + UNKNOWN_WINDOW_MS).toISOString()
    }
  } else if (
    order.status === 'FAILED_CLOSED' &&
    order.paymentStatus === 'EXPIRED_30M' &&
    outcome === 'CAPTURED'
  ) {
    // Money after the order closed: the order is not restored, the customer is owed a refund.
    order.paymentStatus = 'CAPTURED_LATE'
    order.refundObligationVnd = order.totalPayableVnd
  }
  return ok(view(order), 'Payment outcome recorded')
}

function snapshotAddress(deps: OrderMockDeps, userId: string, addressId: unknown) {
  const address =
    typeof addressId === 'string' ? findAddress(deps.addresses, userId, addressId) : undefined
  if (!address) return null
  const { recipient, phone, line1, ward, district, province } = address
  return { recipient, phone, line1, ward, district, province }
}

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
    const rows = mine.slice((page - 1) * limit, page * limit).map((order) => ({
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalPayableVnd: order.totalPayableVnd,
      createdAt: order.createdAt,
      itemCount: order.snapshot.lines.reduce((sum, line) => sum + Number(line.quantity), 0),
    }))
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
      return invalid('outcome', 'outcome must be CAPTURED, FAILED, UNKNOWN or LATE')
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
    quoteId: quote.quoteId,
    status: 'RESERVED',
    paymentStatus: 'PROCESSING',
    failureCode: null,
    totalPayableVnd: quote.totalPayableVnd,
    paymentAttemptId: `pay-${orderId}`,
    createdAt: new Date(deps.now()).toISOString(),
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
