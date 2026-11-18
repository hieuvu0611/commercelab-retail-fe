import type { MockRequest } from '@/auth/mock-api'
import {
  createMockFulfillmentState,
  type MockFulfillmentState,
} from '@/fulfillment/mock-fulfillment'
import { createMockOrderState, type MockOrder, type MockOrderState } from '@/orders/mock-orders'
import { handleReturnsMock, type ReturnsMockDeps } from '../mock-returns'
import { createMockReturnsState, type MockReturnsState } from '../mock-returns-state'

const NOW = Date.parse('2026-11-16T10:00:00.000Z')

function makeDeps(): ReturnsMockDeps {
  const orders: MockOrderState = createMockOrderState()
  const fulfillment: MockFulfillmentState = createMockFulfillmentState()
  const returns: MockReturnsState = createMockReturnsState()

  // Seed delivered order
  const order: MockOrder = {
    orderId: 'O-001',
    userId: 'user-1',
    customerName: 'User 1',
    quoteId: 'Q-001',
    status: 'DELIVERED',
    paymentStatus: 'CAPTURED',
    failureCode: null,
    totalPayableVnd: 660000,
    paymentAttemptId: 'pay-1',
    createdAt: '2026-11-15T10:00:00.000Z',
    expiresAt: '2026-11-15T10:30:00.000Z',
    unknownDeadline: null,
    refundObligationVnd: 0,
    snapshot: {
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      voucherCode: 'SALE10',
      address: null,
      lines: [
        {
          skuId: 'BP-1',
          skuName: 'Backpack',
          orderedQuantity: 2,
          unitPriceVnd: 300000,
          lineDiscountVnd: 60000,
          allocatedUnitPaidVnd: 270000,
        },
      ],
    },
  }
  orders.orders.set('O-001', order)

  // Seed shipment with open return window (7 days)
  fulfillment.shipments.set('O-001', {
    shipmentId: 'SHP-O-001',
    orderId: 'O-001',
    warehouseId: 'WH-HCM-01',
    status: 'DELIVERED',
    version: 1,
    handedOverAt: '2026-11-15T12:00:00.000Z',
    returnWindowEndsAt: new Date(NOW + 5 * 86400 * 1000).toISOString(),
    lines: [{ skuId: 'BP-1', skuName: 'Backpack', orderedQuantity: 2, pickedQuantity: 2 }],
    events: [],
    createdAt: '2026-11-15T10:00:00.000Z',
    shortage: null,
    seenEventIds: new Set(),
  })

  return {
    orders,
    fulfillment,
    returns,
    now: () => NOW,
  }
}

describe('mock returns API', () => {
  it('creates a return request successfully', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'POST',
      path: '/returns',
      idempotencyKey: 'key-1',
      body: {
        orderId: 'O-001',
        reason: 'CHANGED_MIND',
        lines: [{ skuId: 'BP-1', quantity: 1 }],
      },
    }

    const res = handleReturnsMock(req, 'user-1', deps)
    expect(res?.status).toBe(201)
    const body = res?.body as { data: { returnId: string; status: string; items: unknown[] } }
    expect(body.data.returnId).toBe('RMA-001')
    expect(body.data.status).toBe('REQUESTED')
    expect(body.data.items).toHaveLength(1)
  })

  it('replays same return request with same idempotency key', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'POST',
      path: '/returns',
      idempotencyKey: 'key-1',
      body: {
        orderId: 'O-001',
        reason: 'CHANGED_MIND',
        lines: [{ skuId: 'BP-1', quantity: 1 }],
      },
    }

    handleReturnsMock(req, 'user-1', deps)
    const res2 = handleReturnsMock(req, 'user-1', deps)
    expect(res2?.status).toBe(200)
    const body = res2?.body as { data: { returnId: string } }
    expect(body.data.returnId).toBe('RMA-001')
  })

  it('rejects return if return window has closed', () => {
    const deps = makeDeps()
    // Move time past return window
    deps.now = () => NOW + 10 * 86400 * 1000

    const req: MockRequest = {
      method: 'POST',
      path: '/returns',
      idempotencyKey: 'key-window-closed',
      body: {
        orderId: 'O-001',
        reason: 'CHANGED_MIND',
        lines: [{ skuId: 'BP-1', quantity: 1 }],
      },
    }

    const res = handleReturnsMock(req, 'user-1', deps)
    expect(res?.status).toBe(409)
    const body = res?.body as { code: string }
    expect(body.code).toBe('RETURN_WINDOW_CLOSED')
  })

  it('rejects return if quantity exceeds available units', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'POST',
      path: '/returns',
      idempotencyKey: 'key-too-many',
      body: {
        orderId: 'O-001',
        reason: 'CHANGED_MIND',
        lines: [{ skuId: 'BP-1', quantity: 5 }],
      },
    }

    const res = handleReturnsMock(req, 'user-1', deps)
    expect(res?.status).toBe(409)
    const body = res?.body as { code: string }
    expect(body.code).toBe('RETURN_QUANTITY_EXCEEDED')
  })

  it('lists and retrieves returns for customer', () => {
    const deps = makeDeps()
    // Create one return
    handleReturnsMock(
      {
        method: 'POST',
        path: '/returns',
        idempotencyKey: 'k-1',
        body: { orderId: 'O-001', reason: 'DEFECTIVE', lines: [{ skuId: 'BP-1', quantity: 1 }] },
      },
      'user-1',
      deps
    )

    // List returns
    const listRes = handleReturnsMock(
      { method: 'GET', path: '/returns', query: { orderId: 'O-001' } },
      'user-1',
      deps
    )
    expect(listRes?.status).toBe(200)
    const listBody = listRes?.body as { data: Array<{ returnId: string }> }
    expect(listBody.data).toHaveLength(1)
    expect(listBody.data[0].returnId).toBe('RMA-001')

    // Get return detail
    const getRes = handleReturnsMock(
      { method: 'GET', path: '/returns/RMA-001' },
      'user-1',
      deps
    )
    expect(getRes?.status).toBe(200)
    const getBody = getRes?.body as { data: { returnId: string; reason: string } }
    expect(getBody.data.returnId).toBe('RMA-001')
    expect(getBody.data.reason).toBe('DEFECTIVE')
  })
})
