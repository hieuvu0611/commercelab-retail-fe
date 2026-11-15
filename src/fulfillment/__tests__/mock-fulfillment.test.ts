import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, type MockOrder } from '@/orders/mock-orders'
import {
  createMockFulfillmentState,
  handleFulfillmentMock,
  RETURN_WINDOW_DAYS,
  type FulfillmentMockDeps,
} from '../mock-fulfillment'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

const order = (orderId: string, userId: string, status: MockOrder['status']): MockOrder =>
  ({
    orderId,
    userId,
    status,
    createdAt: '2026-11-15T09:00:00.000Z',
    confirmedAt: '2026-11-15T09:05:00.000Z',
    snapshot: { lines: [], address: null },
  }) as unknown as MockOrder

let deps: FulfillmentMockDeps
let nowMs: number
beforeEach(() => {
  nowMs = NOW
  deps = {
    orders: createMockOrderState(),
    fulfillment: createMockFulfillmentState(),
    now: () => nowMs,
  }
  deps.orders.orders.set('O-001', order('O-001', 'u1', 'CONFIRMED'))
  deps.orders.orders.set('O-002', order('O-002', 'u1', 'RESERVED'))
})

type Data = Record<string, unknown>
const tracking = (orderId = 'O-001', userId: string | null = 'u1') =>
  handleFulfillmentMock({ method: 'GET', path: `/orders/${orderId}/tracking` }, userId, deps)
const carrier = (body: Record<string, unknown>) =>
  handleFulfillmentMock({ method: 'POST', path: '/carrier/simulator/events', body }, null, deps)
const data = (response: ReturnType<typeof tracking>) => (response?.body as { data: Data }).data
const events = (response: ReturnType<typeof tracking>) => data(response).events as Data[]

describe('handleFulfillmentMock', () => {
  it('ignores requests that are not about fulfillment', () => {
    const request: MockRequest = { method: 'GET', path: '/orders/O-001' }
    expect(handleFulfillmentMock(request, 'u1', deps)).toBeNull()
  })

  it('answers in the real wire envelope', () => {
    const response = tracking()
    expect(response?.status).toBe(200)
    expect(response?.body).toMatchObject({
      message: expect.any(String),
      data: { orderId: 'O-001' },
    })
  })

  it('requires a signed-in customer and hides other customers orders', () => {
    expect(tracking('O-001', null)?.status).toBe(401)
    expect(tracking('O-001', 'u2')?.status).toBe(404)
  })

  it('has no tracking for an order that was never confirmed', () => {
    const response = tracking('O-002')
    expect(response?.status).toBe(404)
    expect(response?.body).toMatchObject({ code: 'TRACKING_NOT_FOUND' })
  })

  it('starts a confirmed order at packing', () => {
    expect(data(tracking()).status).toBe('PACKING')
    expect(events(tracking()).map((event) => event.status)).toEqual(['CONFIRMED', 'PACKING'])
  })

  it('follows the carrier through transit and delivery and opens the return window', () => {
    expect(carrier({ orderId: 'O-001', event: 'IN_TRANSIT', eventId: 'e1' })?.status).toBe(200)
    nowMs += DAY
    expect(carrier({ orderId: 'O-001', event: 'DELIVERED', eventId: 'e2' })?.status).toBe(200)
    const view = data(tracking())
    expect(view.status).toBe('DELIVERED')
    expect(view.returnWindowEndsAt).toBe(
      new Date(NOW + DAY + RETURN_WINDOW_DAYS * DAY).toISOString()
    )
  })

  it('records a failed delivery with its reason', () => {
    carrier({ orderId: 'O-001', event: 'IN_TRANSIT', eventId: 'e1' })
    carrier({
      orderId: 'O-001',
      event: 'DELIVERY_FAILED',
      eventId: 'e2',
      reason: 'Recipient not available',
    })
    const view = data(tracking())
    expect(view.status).toBe('DELIVERY_FAILED')
    expect(events(tracking()).at(-1)).toMatchObject({ reason: 'Recipient not available' })
    expect(view.returnWindowEndsAt).toBeNull()
  })

  it('does not record a repeated carrier notice twice', () => {
    carrier({ orderId: 'O-001', event: 'IN_TRANSIT', eventId: 'e1' })
    const repeat = carrier({ orderId: 'O-001', event: 'IN_TRANSIT', eventId: 'e1' })
    expect(repeat?.status).toBe(200)
    expect(data(repeat).duplicate).toBe(true)
    expect(events(tracking()).filter((event) => event.status === 'IN_TRANSIT')).toHaveLength(1)
  })

  it('refuses events out of order, without a reason, for unknown orders and unknown events', () => {
    expect(carrier({ orderId: 'O-001', event: 'DELIVERED', eventId: 'e1' })?.status).toBe(409)
    carrier({ orderId: 'O-001', event: 'IN_TRANSIT', eventId: 'e2' })
    expect(carrier({ orderId: 'O-001', event: 'DELIVERY_FAILED', eventId: 'e3' })?.status).toBe(400)
    expect(carrier({ orderId: 'O-404', event: 'IN_TRANSIT', eventId: 'e4' })?.status).toBe(404)
    expect(carrier({ orderId: 'O-001', event: 'EXPLODED', eventId: 'e5' })?.status).toBe(400)
  })
})
