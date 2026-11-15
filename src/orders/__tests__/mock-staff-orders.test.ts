import { createMockAddressState } from '@/addresses/mock-addresses'
import { createMockCartState } from '@/cart/mock-cart'
import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, handleOrderMock, type OrderMockDeps } from '../mock-orders'
import { handleStaffOrderMock } from '../mock-staff-orders'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
const AGENT = { name: 'Support Agent', roles: ['SUPPORT_AGENT'] }

let deps: OrderMockDeps
beforeEach(() => {
  deps = {
    orders: createMockOrderState(),
    quotes: { counter: 0, stored: new Map() },
    carts: createMockCartState(),
    addresses: createMockAddressState(),
    customerName: (userId) => (userId === 'u1' ? 'Lan Nguyen' : 'Binh Tran'),
    now: () => NOW,
  }
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
  deps.addresses.books.set('u2', [
    {
      id: 'addr-1',
      recipient: 'Binh Tran',
      phone: '+84907654321',
      line1: '1 Le Loi',
      ward: 'Ben Thanh',
      district: 'District 3',
      province: 'Ho Chi Minh City',
      isDefault: true,
    },
  ])
  for (const [id, userId] of [
    ['quote-1', 'u1'],
    ['quote-2', 'u2'],
  ]) {
    deps.quotes.stored!.set(id, {
      quoteId: id,
      userId,
      totalPayableVnd: 660000,
      expiresAt: new Date(NOW + 300000).toISOString(),
      addressId: 'addr-1',
      lines: [{ skuId: 'A', skuName: 'City Backpack', quantity: 2, unitPriceVnd: 300000 }],
    })
  }
  const place = (quoteId: string, key: string, userId: string) =>
    handleOrderMock(
      { method: 'POST', path: '/orders', body: { quoteId }, idempotencyKey: key },
      userId,
      deps
    )
  place('quote-1', 'k1', 'u1')
  place('quote-2', 'k2', 'u2')
  handleOrderMock(
    { method: 'POST', path: '/payments/simulator/PAY-O-002/outcome', body: { outcome: 'UNKNOWN' } },
    'u2',
    deps
  )
})

const call = (request: MockRequest, caller: { name: string; roles: string[] } | null = AGENT) =>
  handleStaffOrderMock(request, caller, deps)
const data = (response: ReturnType<typeof call>) =>
  (response?.body as { data: never }).data as unknown

describe('mock staff orders', () => {
  it('ignores other requests, needs sign-in and an order role', () => {
    expect(call({ method: 'GET', path: '/orders' })).toBeNull()
    expect(call({ method: 'GET', path: '/admin/orders' }, null)?.status).toBe(401)
    expect(
      call({ method: 'GET', path: '/admin/orders' }, { name: 'M', roles: ['MARKETING'] })?.status
    ).toBe(403)
    expect(
      call({ method: 'GET', path: '/admin/orders/O-001' }, { name: 'C', roles: ['CUSTOMER'] })
        ?.status
    ).toBe(403)
  })

  it('lists every customer order newest first with the recipient masked', () => {
    const rows = data(call({ method: 'GET', path: '/admin/orders' })) as Array<
      Record<string, unknown>
    >
    expect(rows.map((row) => row.orderId)).toEqual(['O-002', 'O-001'])
    expect(rows.map((row) => row.recipient)).toEqual(['Binh T.', 'Lan N.'])
    expect(rows.map((row) => row.customerId)).toEqual(['u2', 'u1'])
    expect(rows[0]).not.toHaveProperty('line1')
  })

  it('filters by status and pages', () => {
    const ids = (query: Record<string, string>) =>
      (
        data(call({ method: 'GET', path: '/admin/orders', query })) as Array<{ orderId: string }>
      ).map((row) => row.orderId)
    expect(ids({ status: 'UNKNOWN_HOLD' })).toEqual(['O-002'])
    expect(ids({ limit: '1', page: '2' })).toEqual(['O-001'])
    expect(call({ method: 'GET', path: '/admin/orders', query: { status: 'BOGUS' } })?.status).toBe(
      400
    )
  })

  it('shows a detail with the snapshot but only minimal personal data', () => {
    const detail = data(call({ method: 'GET', path: '/admin/orders/O-001' })) as Record<
      string,
      unknown
    >
    expect(detail).toMatchObject({
      orderId: 'O-001',
      recipient: 'Lan N.',
      district: 'District 1',
      province: 'Ho Chi Minh City',
      payment: { status: 'PROCESSING' },
      refundObligation: null,
    })
    expect(detail.phone).toBe('+84******567')
    expect(JSON.stringify(detail)).not.toMatch(/Nguyen Hue|901234567|Lan Nguyen/)
    expect(call({ method: 'GET', path: '/admin/orders/O-999' })?.status).toBe(404)
  })
})
