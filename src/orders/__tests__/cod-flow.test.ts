import {
  createMockOrderState,
  handleOrderMock,
  type MockOrderState,
} from '@/orders/mock-orders'
import {
  createMockFulfillmentState,
  handleFulfillmentMock,
  syncShipments,
  type MockFulfillmentState,
} from '@/fulfillment/mock-fulfillment'
import { getMockAddressState } from '@/addresses/mock-addresses'
import { getMockFinanceState, handleLedgerMock } from '@/finance/mock-finance'
import { describePayment, placeOrderProblem } from '@/orders/order-state'
import type { MockRequest } from '@/auth/mock-api'
import type { StoredQuote } from '@/checkout/mock-checkout'
import type { Order } from '@/types/order'
import { ApiError } from '@/services/api/api-error'

describe('Phase 12: Cash on Delivery (COD) Full-Stack Flow', () => {
  let orderState: MockOrderState
  let fulfillmentState: MockFulfillmentState
  const userId = 'user-cod-tester'

  const mockQuotes = new Map<string, StoredQuote>()

  const addressState = getMockAddressState()
  addressState.books.set(userId, [
    {
      id: 'addr-1',
      recipient: 'Nguyen Van A',
      phone: '+84912345678',
      line1: '123 Le Loi',
      ward: 'Ben Nghe',
      district: 'District 1',
      province: 'Ho Chi Minh City',
      isDefault: true,
    },
  ])

  const testDeps = () => ({
    orders: orderState,
    fulfillment: fulfillmentState,
    quotes: {
      stored: mockQuotes,
      byAddress: new Map(),
      counter: 0,
      activeKey: () => null,
      clear: () => {},
    },
    carts: {
      carts: new Map(),
      items: new Map(),
      version: 1,
    },
    addresses: addressState,
    customerName: () => 'Nguyen Van A',
    now: () => Date.now(),
  })

  beforeEach(() => {
    orderState = createMockOrderState()
    fulfillmentState = createMockFulfillmentState()
    mockQuotes.clear()
  })

  test('P12-T05: COD Ceiling Limit — rejects order > 2,000,000 VND', () => {
    mockQuotes.set('q-expensive', {
      quoteId: 'q-expensive',
      version: 'v1',
      userId,
      addressId: 'addr-1',
      voucherCode: null,
      discountPct: 0,
      subtotalVnd: 2_500_000,
      discountVnd: 0,
      shippingFeeVnd: 0,
      totalPayableVnd: 2_500_000,
      lines: [],
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })

    const req: MockRequest = {
      method: 'POST',
      path: '/orders',
      idempotencyKey: 'idemp-exp-1',
      body: { quoteId: 'q-expensive', paymentMethod: 'COD' },
    }

    const res = handleOrderMock(req, userId, testDeps())
    expect(res?.status).toBe(422)
    expect((res?.body as { code: string }).code).toBe('COD_CEILING_EXCEEDED')

    const problem = placeOrderProblem(
      new ApiError({
        kind: 'http',
        code: 'COD_CEILING_EXCEEDED',
        message: 'COD ceiling exceeded',
        status: 422,
      })
    )
    expect(problem.message).toContain('2,000,000')
  })

  test('P12-T05: COD Velocity Limit — rejects when user already has >= 2 active COD orders', () => {
    // Seed 2 active COD orders in transit
    orderState.orders.set('O-COD-01', {
      orderId: 'O-COD-01',
      userId,
      customerName: 'Nguyen Van A',
      quoteId: 'q-dummy-1',
      status: 'CONFIRMED',
      paymentStatus: 'COD_PENDING',
      paymentMethod: 'COD',
      failureCode: null,
      totalPayableVnd: 500_000,
      paymentAttemptId: 'PAY-O-COD-01',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      unknownDeadline: null,
      refundObligationVnd: 0,
      snapshot: { subtotalVnd: 500_000, discountVnd: 0, shippingFeeVnd: 0, voucherCode: null, address: null, lines: [] },
    })

    orderState.orders.set('O-COD-02', {
      orderId: 'O-COD-02',
      userId,
      customerName: 'Nguyen Van A',
      quoteId: 'q-dummy-2',
      status: 'IN_FULFILLMENT',
      paymentStatus: 'COD_PENDING',
      paymentMethod: 'COD',
      failureCode: null,
      totalPayableVnd: 400_000,
      paymentAttemptId: 'PAY-O-COD-02',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      unknownDeadline: null,
      refundObligationVnd: 0,
      snapshot: { subtotalVnd: 400_000, discountVnd: 0, shippingFeeVnd: 0, voucherCode: null, address: null, lines: [] },
    })

    mockQuotes.set('q-valid', {
      quoteId: 'q-valid',
      version: 'v1',
      userId,
      addressId: 'addr-1',
      voucherCode: null,
      discountPct: 0,
      subtotalVnd: 300_000,
      discountVnd: 0,
      shippingFeeVnd: 0,
      totalPayableVnd: 300_000,
      lines: [],
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })

    const req: MockRequest = {
      method: 'POST',
      path: '/orders',
      idempotencyKey: 'idemp-vel-1',
      body: { quoteId: 'q-valid', paymentMethod: 'COD' },
    }

    const res = handleOrderMock(req, userId, testDeps())
    expect(res?.status).toBe(409)
    expect((res?.body as { code: string }).code).toBe('COD_VELOCITY_LIMIT_EXCEEDED')

    const problem = placeOrderProblem(
      new ApiError({
        kind: 'http',
        code: 'COD_VELOCITY_LIMIT_EXCEEDED',
        message: 'COD velocity limit exceeded',
        status: 409,
      })
    )
    expect(problem.message).toContain('maximum active COD orders limit (2)')
  })

  test('P12-T05 & P12-T06: Valid COD placement, view description, and cash collection', () => {
    mockQuotes.set('q-ok', {
      quoteId: 'q-ok',
      version: 'v1',
      userId,
      addressId: 'addr-1',
      voucherCode: null,
      discountPct: 0,
      subtotalVnd: 750_000,
      discountVnd: 0,
      shippingFeeVnd: 0,
      totalPayableVnd: 750_000,
      lines: [
        {
          skuId: 'SKU-BACKPACK',
          skuName: 'Explorer Backpack 25L',
          quantity: 1,
          unitPriceVnd: 750_000,
          lineSubtotalVnd: 750_000,
          lineDiscountVnd: 0,
          lineNetPayableVnd: 750_000,
          allocatedUnitPaidVnd: 750_000,
        },
      ],
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })

    // Place order with COD
    const placeReq: MockRequest = {
      method: 'POST',
      path: '/orders',
      idempotencyKey: 'idemp-place-cod',
      body: { quoteId: 'q-ok', paymentMethod: 'COD' },
    }

    const placeRes = handleOrderMock(placeReq, userId, testDeps())
    expect(placeRes?.status).toBe(201)
    const orderData = (placeRes?.body as { data: Order }).data
    expect(orderData.status).toBe('CONFIRMED')
    expect(orderData.paymentStatus).toBe('COD_PENDING')
    expect(orderData.paymentMethod).toBe('COD')

    // Describe payment view for customer
    const paymentView = describePayment(orderData)
    expect(paymentView.canSimulate).toBe(false)
    expect(paymentView.body).toContain('750.000')

    // Sync fulfillment
    syncShipments(testDeps())
    const shipment = fulfillmentState.shipments.get(orderData.orderId)
    expect(shipment).toBeDefined()
    expect(shipment?.paymentMethod).toBe('COD')
    expect(shipment?.codAmountToCollect).toBe(750_000)

    // Carrier confirms cash collected
    const collectReq: MockRequest = {
      method: 'POST',
      path: `/payments/orders/${orderData.orderId}/cod-collect`,
      body: { collectedAmount: 750_000 },
    }
    const collectRes = handleOrderMock(collectReq, userId, testDeps())
    expect(collectRes?.status).toBe(200)

    const updatedOrder = orderState.orders.get(orderData.orderId)
    expect(updatedOrder?.paymentStatus).toBe('COLLECTED')
    expect(updatedOrder?.status).toBe('DELIVERED')
  })

  test('P12-T07: Delivery failure transitions COD order to Return-to-Sender and cancels payment', () => {
    orderState.orders.set('O-COD-FAIL', {
      orderId: 'O-COD-FAIL',
      userId,
      customerName: 'Nguyen Van A',
      quoteId: 'q-fail',
      status: 'CONFIRMED',
      paymentStatus: 'COD_PENDING',
      paymentMethod: 'COD',
      failureCode: null,
      totalPayableVnd: 600_000,
      paymentAttemptId: 'PAY-O-COD-FAIL',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      unknownDeadline: null,
      refundObligationVnd: 0,
      snapshot: { subtotalVnd: 600_000, discountVnd: 0, shippingFeeVnd: 0, voucherCode: null, address: null, lines: [] },
    })

    syncShipments(testDeps())
    const shipment = fulfillmentState.shipments.get('O-COD-FAIL')!
    shipment.status = 'IN_TRANSIT'

    // Carrier webhook reports DELIVERY_FAILED
    const carrierReq: MockRequest = {
      method: 'POST',
      path: '/shipments/webhooks/carrier',
      body: {
        type: 'DELIVERY_FAILED',
        eventId: 'EVT-CARRIER-FAIL-01',
        shipmentId: 'SHP-O-COD-FAIL',
        reason: 'Customer rejected package',
      },
    }

    const carrierRes = handleFulfillmentMock(carrierReq, userId, testDeps())
    expect(carrierRes?.status).toBe(200)

    expect(shipment.status).toBe('RETURN_TO_SENDER')
    const order = orderState.orders.get('O-COD-FAIL')
    expect(order?.paymentStatus).toBe('COD_CANCELLED')
    expect(order?.status).toBe('FAILED_CLOSED')
  })

  test('P12-T08: Ledger Accounts 1310 (COD Receivables) and 6420 (Carrier Fee) exist', () => {
    const finState = getMockFinanceState()
    const req: MockRequest = { method: 'GET', path: '/api/v1/admin/ledger/accounts' }
    const res = handleLedgerMock(req, 'fin-user', finState)
    expect(res?.status).toBe(200)

    const accounts = (res?.body as { data: Array<{ accountCode: string; accountName: string }> }).data
    expect(accounts.some((a) => a.accountCode === '1310' && a.accountName.includes('COD'))).toBe(true)
    expect(accounts.some((a) => a.accountCode === '6420' && a.accountName.includes('COD'))).toBe(true)
  })
})
