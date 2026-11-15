import { createMockCartState } from '@/cart/mock-cart'
import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, handleOrderMock, type OrderMockDeps } from '../mock-orders'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
const MINUTE = 60 * 1000

let deps: OrderMockDeps
let nowMs: number
beforeEach(() => {
  nowMs = NOW
  deps = {
    orders: createMockOrderState(),
    quotes: { counter: 2, stored: new Map() },
    carts: createMockCartState(),
    now: () => nowMs,
  }
  deps.carts.carts.set('u1', new Map([['SKU-A', 2]]))
  for (const [id, userId] of [
    ['quote-1', 'u1'],
    ['quote-2', 'u1'],
    ['quote-other', 'u2'],
  ]) {
    deps.quotes.stored!.set(id, {
      quoteId: id,
      userId,
      totalPayableVnd: 660000,
      expiresAt: new Date(NOW + 5 * MINUTE).toISOString(),
    })
  }
})

type Data = Record<string, unknown>
const call = (request: MockRequest, userId: string | null = 'u1') =>
  handleOrderMock(request, userId, deps)
const place = (quoteId: string, key: string | null = 'key-1', userId: string | null = 'u1') =>
  call({ method: 'POST', path: '/orders', body: { quoteId }, idempotencyKey: key }, userId)
const data = (response: ReturnType<typeof call>) => (response?.body as { data: Data }).data
const outcome = (attemptId: string, value: string, userId: string | null = 'u1') =>
  call(
    { method: 'POST', path: `/payments/simulator/${attemptId}/outcome`, body: { outcome: value } },
    userId
  )
const read = (orderId: string, userId: string | null = 'u1') =>
  data(call({ method: 'GET', path: `/orders/${orderId}` }, userId))

describe('mock place order', () => {
  it('ignores other requests and needs sign-in', () => {
    expect(call({ method: 'GET', path: '/products' })).toBeNull()
    expect(place('quote-1', 'key-1', null)?.status).toBe(401)
  })

  it('creates a reserved order for the quote total with a payment attempt', () => {
    const response = place('quote-1')
    expect(response?.status).toBe(201)
    expect(data(response)).toMatchObject({
      orderId: 'O-001',
      status: 'RESERVED',
      paymentStatus: 'PROCESSING',
      totalPayableVnd: 660000,
      paymentAttemptId: 'pay-O-001',
    })
  })

  it('SC04: the same key replays the same order and creates no second one', () => {
    place('quote-1')
    const again = place('quote-1')
    expect(again?.status).toBe(200)
    expect(data(again).orderId).toBe('O-001')
    expect(deps.orders.orders.size).toBe(1)
  })

  it('SC04: the same key with another quote is a 409', () => {
    place('quote-1')
    const conflict = place('quote-2')
    expect(conflict?.status).toBe(409)
    expect((conflict?.body as { code: string }).code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('keys are per customer', () => {
    place('quote-1')
    expect(data(place('quote-other', 'key-1', 'u2')).orderId).toBe('O-002')
  })

  it('validates the key and the body', () => {
    expect(place('quote-1', null)?.status).toBe(400)
    expect(place('quote-1', 'bad key!')?.status).toBe(400)
    const extra = call({
      method: 'POST',
      path: '/orders',
      body: { quoteId: 'quote-1', totalPayableVnd: 1 },
      idempotencyKey: 'key-1',
    })
    expect(extra?.status).toBe(400)
  })

  it('refuses another customer quote and an expired quote', () => {
    expect(place('quote-other')?.status).toBe(404)
    nowMs += 6 * MINUTE
    const expired = place('quote-1')
    expect(expired?.status).toBe(409)
    expect((expired?.body as { code: string }).code).toBe('QUOTE_EXPIRED')
  })

  it('replays after the quote expired without checking the quote again', () => {
    place('quote-1')
    nowMs += 6 * MINUTE
    expect(place('quote-1')?.status).toBe(200)
  })
})

describe('mock payment simulator', () => {
  beforeEach(() => void place('quote-1'))

  it('CAPTURED confirms the order and empties the cart', () => {
    const response = outcome('pay-O-001', 'CAPTURED')
    expect(data(response)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' })
    expect(deps.carts.carts.has('u1')).toBe(false)
  })

  it('FAILED closes the order and keeps the cart', () => {
    expect(data(outcome('pay-O-001', 'FAILED'))).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'FAILED',
      failureCode: 'PAYMENT_FAILED',
    })
    expect(deps.carts.carts.has('u1')).toBe(true)
  })

  it('UNKNOWN holds the order for 30 minutes', () => {
    const order = data(outcome('pay-O-001', 'UNKNOWN'))
    expect(order).toMatchObject({ status: 'UNKNOWN_HOLD', paymentStatus: 'UNKNOWN' })
    expect(Date.parse(order.unknownDeadline as string) - NOW).toBe(30 * MINUTE)
  })

  it('a capture inside the window still confirms an unknown payment', () => {
    outcome('pay-O-001', 'UNKNOWN')
    nowMs += 20 * MINUTE
    expect(data(outcome('pay-O-001', 'CAPTURED'))).toMatchObject({ status: 'CONFIRMED' })
  })

  it('SC05: an unknown payment closes after 30 minutes and a late capture is refunded, not restored', () => {
    outcome('pay-O-001', 'UNKNOWN')
    nowMs += 31 * MINUTE
    expect(read('O-001')).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'EXPIRED_30M',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
    })
    expect(data(outcome('pay-O-001', 'CAPTURED'))).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'CAPTURED_LATE',
      refundObligationVnd: 660000,
    })
  })

  it('LATE jumps past the window for the simulator and records the refund', () => {
    outcome('pay-O-001', 'UNKNOWN')
    expect(data(outcome('pay-O-001', 'LATE'))).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'CAPTURED_LATE',
      refundObligationVnd: 660000,
    })
  })

  it('LATE is refused unless the payment is unknown', () => {
    expect(outcome('pay-O-001', 'LATE')?.status).toBe(409)
  })

  it('never overwrites a final outcome and replays the stored state', () => {
    outcome('pay-O-001', 'CAPTURED')
    expect(data(outcome('pay-O-001', 'FAILED'))).toMatchObject({ status: 'CONFIRMED' })
    expect(data(outcome('pay-O-001', 'CAPTURED'))).toMatchObject({ status: 'CONFIRMED' })
  })

  it('is owner only', () => {
    expect(outcome('pay-O-001', 'CAPTURED', 'u2')?.status).toBe(404)
    expect(outcome('pay-O-999', 'CAPTURED')?.status).toBe(404)
    expect(outcome('pay-O-001', 'bogus')?.status).toBe(400)
  })
})

describe('mock read order', () => {
  it('returns the order to its owner only', () => {
    place('quote-1')
    expect(read('O-001')).toMatchObject({ orderId: 'O-001' })
    expect(call({ method: 'GET', path: '/orders/O-001' }, 'u2')?.status).toBe(404)
    expect(call({ method: 'GET', path: '/orders/O-001' }, null)?.status).toBe(401)
  })
})
