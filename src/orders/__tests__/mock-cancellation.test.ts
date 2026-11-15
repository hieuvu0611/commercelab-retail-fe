import { createMockFulfillmentState, syncShipments } from '@/fulfillment/mock-fulfillment'
import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, type MockOrder } from '../mock-orders'
import {
  createMockCancellationState,
  handleCancellationMock,
  type CancellationMockDeps,
} from '../mock-cancellation'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')

const order = (orderId: string, status: MockOrder['status'], userId = 'u1'): MockOrder =>
  ({
    orderId,
    userId,
    status,
    paymentStatus: status === 'RESERVED' ? 'PROCESSING' : 'CAPTURED',
    failureCode: null,
    totalPayableVnd: 660000,
    paymentAttemptId: `PAY-${orderId}`,
    createdAt: '2026-11-15T09:00:00.000Z',
    confirmedAt: '2026-11-15T09:05:00.000Z',
    expiresAt: '2026-11-15T09:10:00.000Z',
    unknownDeadline: null,
    refundObligationVnd: 0,
    snapshot: {
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      voucherCode: 'WELCOME10',
      address: null,
      lines: [{ skuId: 'BP-1', skuName: 'Backpack', quantity: 2 }],
    },
  }) as unknown as MockOrder

let deps: CancellationMockDeps
beforeEach(() => {
  deps = {
    orders: createMockOrderState(),
    fulfillment: createMockFulfillmentState(),
    cancellations: createMockCancellationState(),
    now: () => NOW,
  }
})

type Data = Record<string, unknown>
const cancel = (
  orderId: string,
  body: unknown = { reason: 'CHANGED_MIND' },
  userId: string | null = 'u1'
) => {
  const request: MockRequest = { method: 'POST', path: `/orders/${orderId}/cancel`, body }
  return handleCancellationMock(request, userId, deps)
}
const data = (response: ReturnType<typeof cancel>) => (response?.body as { data: Data }).data
const code = (response: ReturnType<typeof cancel>) => (response?.body as { code: string }).code
const shipmentOf = (orderId: string) => deps.fulfillment.shipments.get(orderId)!

/** Puts a confirmed order into the shipment state under test. */
function confirmedAt(orderId: string, status: string) {
  deps.fulfillment.shipments.delete(orderId)
  deps.orders.orders.set(orderId, order(orderId, 'CONFIRMED'))
  syncShipments(deps)
  shipmentOf(orderId).status = status as never
}

describe('mock cancel order', () => {
  it('ignores other requests and needs sign-in', () => {
    expect(handleCancellationMock({ method: 'GET', path: '/orders/O-1' }, 'u1', deps)).toBeNull()
    expect(cancel('O-001', undefined, null)?.status).toBe(401)
  })

  it('does not reveal another customer’s order', () => {
    deps.orders.orders.set('O-001', order('O-001', 'RESERVED', 'u2'))
    expect(cancel('O-001')?.status).toBe(404)
    expect(cancel('O-404')?.status).toBe(404)
  })

  it('needs one of the listed reasons', () => {
    deps.orders.orders.set('O-001', order('O-001', 'RESERVED'))
    expect(cancel('O-001', {})?.status).toBe(400)
    expect(cancel('O-001', { reason: 'because' })?.status).toBe(400)
    expect(deps.orders.orders.get('O-001')!.status).toBe('RESERVED')
  })

  it('cancels an unpaid order at once with nothing to refund', () => {
    deps.orders.orders.set('O-001', order('O-001', 'RESERVED'))
    const response = cancel('O-001')
    expect(response?.status).toBe(200)
    expect(data(response)).toMatchObject({
      status: 'CANCELLED',
      cancellation: { status: 'CONFIRMED' },
      refundObligation: null,
    })
  })

  it('cancels a paid order that picking has not started, stops the parcel and owes the full amount', () => {
    confirmedAt('O-001', 'PENDING_PICK')
    const response = cancel('O-001')
    expect(data(response)).toMatchObject({
      status: 'CANCELLED',
      cancellation: { status: 'CONFIRMED' },
      refundObligation: { amountVnd: 660000, status: 'PENDING' },
    })
    expect(shipmentOf('O-001').status).toBe('STOPPED_FOR_CANCEL')
  })

  it('waits for the warehouse when the order is being picked or packed', () => {
    confirmedAt('O-001', 'PICKING')
    confirmedAt('O-003', 'PACKED')
    for (const orderId of ['O-001', 'O-003']) {
      const response = cancel(orderId)
      expect(data(response)).toMatchObject({
        status: 'CANCEL_REQUESTED',
        cancellation: { status: 'REQUESTED' },
        refundObligation: null,
      })
      expect(shipmentOf(orderId).status).not.toBe('STOPPED_FOR_CANCEL')
    }
    expect([...deps.cancellations.alerts.values()].map((alert) => alert.orderId)).toEqual([
      'O-001',
      'O-003',
    ])
  })

  it('addresses the stop request to the warehouse that packs the order', () => {
    confirmedAt('O-001', 'PICKING')
    cancel('O-001')
    expect([...deps.cancellations.alerts.values()][0]).toMatchObject({
      warehouseId: 'WH-HCM-01',
      shipmentId: 'SHP-O-001',
      status: 'OPEN',
    })
  })

  it('refuses once the parcel is handed over and explains it', () => {
    for (const status of ['HANDED_OVER', 'IN_TRANSIT']) {
      confirmedAt('O-001', status)
      const response = cancel('O-001')
      expect(response?.status).toBe(409)
      expect(code(response)).toBe('ORDER_ALREADY_HANDED_OVER')
      expect(deps.orders.orders.get('O-001')!.status).toBe('IN_FULFILLMENT')
    }
  })

  it('refuses a delivered, closed or payment-unknown order', () => {
    deps.orders.orders.set('O-001', order('O-001', 'DELIVERED'))
    deps.orders.orders.set('O-003', order('O-003', 'FAILED_CLOSED'))
    deps.orders.orders.set('O-005', order('O-005', 'UNKNOWN_HOLD'))
    expect(code(cancel('O-001'))).toBe('ORDER_NOT_CANCELLABLE')
    expect(code(cancel('O-003'))).toBe('ORDER_NOT_CANCELLABLE')
    expect(code(cancel('O-005'))).toBe('PAYMENT_UNRESOLVED')
  })

  it('answers a repeated request with the same result and never refunds or alerts twice', () => {
    confirmedAt('O-001', 'PENDING_PICK')
    confirmedAt('O-003', 'PICKING')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(cancel('O-001')?.status).toBe(200)
      expect(cancel('O-003')?.status).toBe(200)
    }
    expect(deps.orders.orders.get('O-001')!.refundObligationVnd).toBe(660000)
    expect(shipmentOf('O-001').version).toBe(2)
    expect(deps.cancellations.alerts.size).toBe(1)
    expect(data(cancel('O-003'))).toMatchObject({ status: 'CANCEL_REQUESTED' })
  })
})
