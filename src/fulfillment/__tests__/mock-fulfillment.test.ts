import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, type MockOrder } from '@/orders/mock-orders'
import { handleShipmentAdminMock } from '../mock-shipments'
import {
  createMockFulfillmentState,
  mockWarehouseOf,
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
    snapshot: {
      lines: [
        { skuId: 'BP-1', skuName: 'Backpack', quantity: 2 },
        { skuId: 'BT-1', skuName: 'Bottle', quantity: 1 },
      ],
      address: null,
    },
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
  handleFulfillmentMock({ method: 'POST', path: '/shipments/webhooks/carrier', body }, null, deps)
const data = (response: ReturnType<typeof tracking>) => (response?.body as { data: Data }).data
const staff = { name: 'Warehouse', roles: ['WAREHOUSE_STAFF'], warehouseScopes: ['ALL'] }
const warehouse = (path: string, body: Record<string, unknown> = {}) =>
  handleShipmentAdminMock(
    { method: 'POST', path: `/admin/shipments/SHP-O-001/${path}`, body },
    staff,
    deps
  )
/** Picks everything, packs and hands the parcel to the carrier. */
const handOver = () => {
  warehouse('scan', { skuId: 'BP-1', quantity: 2 })
  warehouse('scan', { skuId: 'BT-1', quantity: 1 })
  warehouse('pack')
  warehouse('handover')
}
const events = (response: ReturnType<typeof tracking>) => data(response).timeline as Data[]

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

  it('starts a confirmed order waiting to be picked and moves the order into fulfilment', () => {
    expect(data(tracking()).status).toBe('PENDING_PICK')
    expect(events(tracking()).map((event) => event.type)).toEqual(['CREATED'])
    expect(deps.orders.orders.get('O-001')?.status).toBe('IN_FULFILLMENT')
    expect(deps.orders.orders.get('O-002')?.status).toBe('RESERVED')
  })

  it('shows the warehouse steps on the customer timeline', () => {
    handOver()
    expect(events(tracking()).map((event) => event.type)).toEqual([
      'CREATED',
      'PICKING_STARTED',
      'PACKED',
      'HANDED_OVER',
    ])
  })

  it('sends odd order numbers to Ho Chi Minh City and even ones to Hanoi', () => {
    expect(mockWarehouseOf('O-001')).toBe('WH-HCM-01')
    expect(mockWarehouseOf('O-002')).toBe('WH-HN-01')
  })

  it('follows the carrier through transit and delivery and opens the return window', () => {
    handOver()
    expect(carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })?.status).toBe(
      200
    )
    nowMs += DAY
    expect(carrier({ shipmentId: 'SHP-O-001', type: 'DELIVERED', eventId: 'e2' })?.status).toBe(200)
    const view = data(tracking())
    expect(view.status).toBe('DELIVERED')
    expect(view.returnWindowEndsAt).toBe(
      new Date(NOW + DAY + RETURN_WINDOW_DAYS * DAY).toISOString()
    )
  })

  it('records a failed delivery with its reason', () => {
    handOver()
    carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })
    carrier({
      shipmentId: 'SHP-O-001',
      type: 'DELIVERY_FAILED',
      eventId: 'e2',
      reason: 'Recipient not available',
    })
    const view = data(tracking())
    expect(view.status).toBe('DELIVERY_FAILED')
    expect(events(tracking()).at(-1)).toMatchObject({
      message: expect.stringContaining('Recipient not available'),
    })
    expect(view.returnWindowEndsAt).toBeUndefined()
  })

  it('does not record a repeated carrier notice twice', () => {
    handOver()
    carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })
    const repeat = carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })
    expect(repeat?.status).toBe(200)
    expect(data(repeat).duplicate).toBe(true)
    expect(events(tracking()).filter((event) => event.type === 'IN_TRANSIT')).toHaveLength(1)
  })

  it('acknowledges a late notice for a state the shipment already passed without a second change', () => {
    handOver()
    carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })
    const repeat = carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e-other' })
    expect(data(repeat).duplicate).toBe(true)
    expect(events(tracking()).filter((event) => event.type === 'IN_TRANSIT')).toHaveLength(1)
  })

  it('never moves a parcel the carrier was not handed', () => {
    const response = carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e1' })
    expect(response?.status).toBe(409)
    expect(data(tracking()).status).toBe('PENDING_PICK')
  })

  it('refuses events out of order, without a reason, for unknown orders and unknown events', () => {
    handOver()
    expect(carrier({ shipmentId: 'SHP-O-001', type: 'DELIVERED', eventId: 'e1' })?.status).toBe(409)
    carrier({ shipmentId: 'SHP-O-001', type: 'IN_TRANSIT', eventId: 'e2' })
    expect(
      carrier({ shipmentId: 'SHP-O-001', type: 'DELIVERY_FAILED', eventId: 'e3' })?.status
    ).toBe(400)
    expect(carrier({ shipmentId: 'SHP-O-404', type: 'IN_TRANSIT', eventId: 'e4' })?.status).toBe(
      404
    )
    expect(carrier({ shipmentId: 'SHP-O-001', type: 'EXPLODED', eventId: 'e5' })?.status).toBe(400)
  })
})
