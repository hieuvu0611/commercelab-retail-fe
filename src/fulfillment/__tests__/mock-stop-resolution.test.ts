import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, type MockOrder } from '@/orders/mock-orders'
import {
  createMockCancellationState,
  handleCancellationMock,
  openAlertsFor,
  streamAccess,
  type MockCancellationState,
} from '@/orders/mock-cancellation'
import { createMockFulfillmentState, type FulfillmentMockDeps } from '../mock-fulfillment'
import { handleShipmentAdminMock, type ShipmentCaller } from '../mock-shipments'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')

const order = (orderId: string): MockOrder =>
  ({
    orderId,
    userId: 'u1',
    status: 'CONFIRMED',
    paymentStatus: 'CAPTURED',
    totalPayableVnd: 660000,
    refundObligationVnd: 0,
    createdAt: '2026-11-15T09:00:00.000Z',
    confirmedAt: '2026-11-15T09:05:00.000Z',
    snapshot: { lines: [{ skuId: 'BP-1', skuName: 'Backpack', quantity: 1 }], address: null },
  }) as unknown as MockOrder

const hcm: ShipmentCaller = {
  name: 'HCM',
  roles: ['WAREHOUSE_STAFF'],
  warehouseScopes: ['WH-HCM-01'],
}
const hn: ShipmentCaller = { name: 'HN', roles: ['WAREHOUSE_STAFF'], warehouseScopes: ['WH-HN-01'] }
const all: ShipmentCaller = { name: 'M', roles: ['WAREHOUSE_MGR'], warehouseScopes: ['ALL'] }

let deps: FulfillmentMockDeps & { cancellations: MockCancellationState }
let events: Array<{ type: string; alert: { orderId: string; status: string } }>
beforeEach(() => {
  deps = {
    orders: createMockOrderState(),
    fulfillment: createMockFulfillmentState(),
    cancellations: createMockCancellationState(),
    now: () => NOW,
  }
  events = []
  deps.cancellations.listeners.add((event) =>
    events.push({ ...event, alert: { ...event.alert } } as never)
  )
  // O-001 is picked in Ho Chi Minh City, O-002 in Hanoi.
  deps.orders.orders.set('O-001', order('O-001'))
  deps.orders.orders.set('O-002', order('O-002'))
})

type Data = Record<string, unknown>
const admin = (method: string, path: string, caller: ShipmentCaller | null, body?: unknown) =>
  handleShipmentAdminMock({ method, path, body } as MockRequest, caller, deps)!
const data = (response: { body: unknown }) => (response.body as { data: Data }).data
const code = (response: { body: unknown }) => (response.body as { code: string }).code
const version = (id: string) => Number(data(admin('GET', `/admin/shipments/${id}`, all)).version)
const cancel = (orderId: string) =>
  handleCancellationMock(
    { method: 'POST', path: `/orders/${orderId}/cancel`, body: { reason: 'CHANGED_MIND' } },
    'u1',
    deps
  )!
const confirmStop = (id: string, caller: ShipmentCaller | null = hcm) =>
  admin('POST', `/admin/shipments/${id}/confirm-stop`, caller, { version: version(id) })

/** A paid order whose parcel is being picked, with the customer's cancel request open. */
function pickingWithStopRequest(orderId = 'O-001') {
  admin('GET', '/admin/shipments', all)
  admin('POST', `/admin/shipments/SHP-${orderId}/scan`, all, {
    skuId: 'BP-1',
    quantity: 1,
    version: version(`SHP-${orderId}`),
  })
  expect(cancel(orderId).status).toBe(202)
}
const packed = (id: string) =>
  admin('POST', `/admin/shipments/${id}/pack`, all, { version: version(id) })
const orderOf = (orderId: string) => deps.orders.orders.get(orderId)!

describe('SC06 branch A: the stop wins', () => {
  it('stops the parcel, cancels the order, owes the whole amount and tells subscribers', () => {
    pickingWithStopRequest()
    const response = confirmStop('SHP-O-001')
    expect(response.status).toBe(200)
    expect(data(response).status).toBe('STOPPED_FOR_CANCEL')
    expect(orderOf('O-001')).toMatchObject({
      status: 'CANCELLED',
      refundObligationVnd: 660000,
      cancellation: { status: 'CONFIRMED' },
    })
    expect(openAlertsFor(deps.cancellations, 'WH-HCM-01')).toEqual([])
    expect(events.map((event) => [event.type, event.alert.status])).toEqual([
      ['stop_requested', 'OPEN'],
      ['stop_resolved', 'STOPPED'],
    ])
  })

  it('never lets the stopped parcel be handed over', () => {
    pickingWithStopRequest()
    packed('SHP-O-001')
    confirmStop('SHP-O-001')
    expect(
      admin('POST', '/admin/shipments/SHP-O-001/handover', hcm, { version: version('SHP-O-001') })
        .status
    ).toBe(409)
  })

  it('answers a repeated confirmation with the same result: one refund, no new version', () => {
    pickingWithStopRequest()
    confirmStop('SHP-O-001')
    const before = version('SHP-O-001')
    expect(confirmStop('SHP-O-001').status).toBe(200)
    expect(confirmStop('SHP-O-001').status).toBe(200)
    expect(version('SHP-O-001')).toBe(before)
    expect(orderOf('O-001').refundObligationVnd).toBe(660000)
    expect(events.filter((event) => event.type === 'stop_resolved')).toHaveLength(1)
  })
})

describe('SC06 branch B: the handover wins', () => {
  it('hands over, rejects the cancellation without a refund and resolves the alert', () => {
    pickingWithStopRequest()
    packed('SHP-O-001')
    const response = admin('POST', '/admin/shipments/SHP-O-001/handover', hcm, {
      version: version('SHP-O-001'),
    })
    expect(response.status).toBe(200)
    expect(data(response).status).toBe('HANDED_OVER')
    expect(orderOf('O-001')).toMatchObject({
      status: 'IN_FULFILLMENT',
      refundObligationVnd: 0,
      cancellation: { status: 'REFUSED' },
    })
    expect(events.at(-1)).toMatchObject({ type: 'stop_resolved', alert: { status: 'HANDED_OVER' } })
  })

  it('refuses the stop afterwards, and the customer is told it was too late', () => {
    pickingWithStopRequest()
    packed('SHP-O-001')
    admin('POST', '/admin/shipments/SHP-O-001/handover', hcm, { version: version('SHP-O-001') })
    const response = confirmStop('SHP-O-001')
    expect(response.status).toBe(409)
    expect(code(response)).toBe('SHIPMENT_ALREADY_HANDED_OVER')
    expect(code(cancel('O-001'))).toBe('ORDER_HANDED_OVER')
    expect(orderOf('O-001').refundObligationVnd).toBe(0)
  })
})

describe('confirm-stop guards', () => {
  it('needs a customer stop request first', () => {
    admin('GET', '/admin/shipments', all)
    expect(code(confirmStop('SHP-O-001'))).toBe('NO_STOP_REQUEST')
    expect(orderOf('O-001').status).toBe('IN_FULFILLMENT')
  })

  it('refuses an old version, a warehouse outside the scope and non-warehouse callers', () => {
    pickingWithStopRequest()
    expect(
      admin('POST', '/admin/shipments/SHP-O-001/confirm-stop', hcm, { version: 1 }).status
    ).toBe(409)
    expect(confirmStop('SHP-O-001', hn).status).toBe(403)
    expect(
      admin('POST', '/admin/shipments/SHP-O-001/confirm-stop', { ...hcm, roles: ['MARKETING'] }, {})
        .status
    ).toBe(403)
    expect(orderOf('O-001').status).toBe('CANCEL_REQUESTED')
  })
})

describe('alert stream access and replay', () => {
  it('lets a warehouse member in for their warehouse and nobody else', () => {
    expect(streamAccess(hcm, 'WH-HCM-01')).toBe(200)
    expect(streamAccess(hcm, 'WH-HN-01')).toBe(403)
    expect(streamAccess(all, 'WH-HN-01')).toBe(200)
    expect(streamAccess({ ...hcm, roles: ['MARKETING'] }, 'WH-HCM-01')).toBe(403)
    expect(streamAccess(null, 'WH-HCM-01')).toBe(401)
  })

  it('lists open alerts of one warehouse for a late subscriber', () => {
    pickingWithStopRequest('O-001')
    pickingWithStopRequest('O-002')
    expect(openAlertsFor(deps.cancellations, 'WH-HCM-01').map((alert) => alert.orderId)).toEqual([
      'O-001',
    ])
    expect(openAlertsFor(deps.cancellations, 'WH-HN-01').map((alert) => alert.orderId)).toEqual([
      'O-002',
    ])
  })
})
