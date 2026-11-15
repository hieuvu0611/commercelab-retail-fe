import { createMockAddressState } from '@/addresses/mock-addresses'
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
    addresses: createMockAddressState(),
    customerName: () => 'Lan Nguyen',
    now: () => nowMs,
  }
  deps.carts.carts.set('u1', new Map([['SKU-A', 2]]))
  deps.addresses.books.set('u1', [
    {
      id: 'addr-1',
      recipient: 'Lan Nguyen',
      phone: '+84901234567',
      line1: '12 Nguyen Hue',
      ward: 'Ben Nghe',
      district: 'District 1',
      province: 'Ho Chi Minh City',
      isDefault: true,
    },
  ])
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
      addressId: 'addr-1',
      voucherCode: 'WELCOME10',
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      lines: [
        {
          skuId: 'SKU-A',
          skuName: 'City Backpack (Black / 20 L)',
          quantity: 2,
          unitPriceVnd: 300000,
          lineSubtotalVnd: 600000,
          lineDiscountVnd: 60000,
          lineNetPayableVnd: 540000,
          allocatedUnitPaidVnd: 270000,
        },
      ],
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
      paymentAttemptId: 'PAY-O-001',
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

  it('answers with the payment attempt, not the order', () => {
    expect(data(outcome('PAY-O-001', 'CAPTURED'))).toMatchObject({
      attemptId: 'PAY-O-001',
      orderId: 'O-001',
      status: 'CAPTURED',
      capturedAmountVnd: 660000,
    })
  })

  it('CAPTURED confirms the order and empties the cart', () => {
    outcome('PAY-O-001', 'CAPTURED')
    expect(read('O-001')).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      payment: { attemptId: 'PAY-O-001', capturedAmountVnd: 660000, expectedAmountVnd: 660000 },
      refundObligation: null,
    })
    expect(deps.carts.carts.has('u1')).toBe(false)
  })

  it('FAILED closes the order and keeps the cart', () => {
    outcome('PAY-O-001', 'FAILED')
    expect(read('O-001')).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'FAILED',
      failureCode: 'PAYMENT_FAILED',
    })
    expect(deps.carts.carts.has('u1')).toBe(true)
  })

  it('UNKNOWN holds the order for 30 minutes', () => {
    outcome('PAY-O-001', 'UNKNOWN')
    expect(read('O-001')).toMatchObject({ status: 'UNKNOWN_HOLD', paymentStatus: 'UNKNOWN_30M' })
    expect(Date.parse(deps.orders.orders.get('O-001')!.unknownDeadline as string) - NOW).toBe(
      30 * MINUTE
    )
  })

  it('a capture inside the window still confirms an unknown payment', () => {
    outcome('PAY-O-001', 'UNKNOWN')
    nowMs += 20 * MINUTE
    outcome('PAY-O-001', 'CAPTURED')
    expect(read('O-001')).toMatchObject({ status: 'CONFIRMED' })
  })

  it('SC05: an unknown payment closes after 30 minutes and a late capture is refunded, not restored', () => {
    outcome('PAY-O-001', 'UNKNOWN')
    nowMs += 31 * MINUTE
    expect(read('O-001')).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'UNKNOWN_30M',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
    })
    outcome('PAY-O-001', 'CAPTURED')
    expect(read('O-001')).toMatchObject({
      status: 'FAILED_CLOSED',
      paymentStatus: 'REFUND_PENDING',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      refundObligation: { amountVnd: 660000, status: 'PENDING' },
    })
  })

  it('has no LATE outcome: a late capture is CAPTURED after the window', () => {
    expect(outcome('PAY-O-001', 'LATE')?.status).toBe(400)
  })

  it('never overwrites a final outcome and replays the stored state', () => {
    outcome('PAY-O-001', 'CAPTURED')
    outcome('PAY-O-001', 'FAILED')
    expect(read('O-001')).toMatchObject({ status: 'CONFIRMED' })
    outcome('PAY-O-001', 'CAPTURED')
    expect(read('O-001')).toMatchObject({ status: 'CONFIRMED' })
  })

  it('is owner only', () => {
    expect(outcome('PAY-O-001', 'CAPTURED', 'u2')?.status).toBe(404)
    expect(outcome('PAY-O-999', 'CAPTURED')?.status).toBe(404)
    expect(outcome('PAY-O-001', 'bogus')?.status).toBe(400)
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

describe('mock order history and detail', () => {
  it('freezes the commercial snapshot: lines, paid per unit, totals and the address', () => {
    place('quote-1')
    deps.addresses.books.get('u1')![0].line1 = 'Somewhere else 1'
    expect(read('O-001')).toMatchObject({
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      voucherCode: 'WELCOME10',
      shippingAddress: { recipient: 'Lan Nguyen', line1: '12 Nguyen Hue' },
      items: [{ skuId: 'SKU-A', quantity: 2, allocatedUnitPaidVnd: 270000 }],
    })
  })

  it('lists only the caller orders, newest first, with paging', () => {
    place('quote-1', 'k1')
    nowMs += MINUTE
    place('quote-2', 'k2')
    place('quote-other', 'k3', 'u2')
    const response = call({ method: 'GET', path: '/orders', query: { limit: '1', page: '1' } })
    const body = response?.body as {
      data: Array<{ orderId: string; itemCount: number }>
      metadata: { total: number; pageCount: number }
    }
    expect(body.data.map((o) => o.orderId)).toEqual(['O-002'])
    expect(body.data[0].itemCount).toBe(2)
    expect(body.metadata).toMatchObject({ total: 2, pageCount: 2, page: 1, limit: 1 })
    const second = call({ method: 'GET', path: '/orders', query: { limit: '1', page: '2' } })
    expect((second?.body as { data: Array<{ orderId: string }> }).data[0].orderId).toBe('O-001')
  })

  it('needs sign-in to list and validates the paging', () => {
    expect(call({ method: 'GET', path: '/orders' }, null)?.status).toBe(401)
    expect(call({ method: 'GET', path: '/orders', query: { limit: '0' } })?.status).toBe(400)
  })
})
