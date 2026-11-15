import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StaffOrderRow } from '@/types/order'

const api = { listStaffOrders: jest.fn(), getStaffOrder: jest.fn() }
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/orders/staff-orders-api', () => ({
  STAFF_ORDERS_KEY: ['staff-orders'],
  staffOrderKey: (id: string) => ['staff-order', id],
  listStaffOrders: (...a: unknown[]) => api.listStaffOrders(...a),
  getStaffOrder: (...a: unknown[]) => api.getStaffOrder(...a),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { OrderAdminDetail, OrdersAdmin } from '../orders-admin'

const AGENT = {
  user: { id: 's', name: 'S', email: 's@x.vn', roles: ['SUPPORT_AGENT'], warehouseScopes: [] },
}
const row = (overrides: Partial<StaffOrderRow> = {}): StaffOrderRow => ({
  orderId: 'O-002',
  status: 'UNKNOWN_HOLD',
  paymentStatus: 'UNKNOWN_30M',
  failureCode: null,
  totalPayableVnd: 660000,
  createdAt: '2026-11-15T10:00:00.000Z',
  itemCount: 3,
  customerId: 'user-binh',
  warehouseId: 'WH-HCM-01',
  shipTo: {
    recipient: 'Binh T.',
    phone: '+84******321',
    district: 'District 1',
    province: 'Ho Chi Minh City',
  },
  ...overrides,
})

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  sessionState = { data: AGENT, status: 'authenticated' }
  api.listStaffOrders.mockResolvedValue({
    items: [
      row(),
      row({
        orderId: 'O-001',
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        shipTo: {
          recipient: 'Lan N.',
          phone: '+84******567',
          district: 'District 3',
          province: 'Ho Chi Minh City',
        },
      }),
    ],
    total: 2,
    pageCount: 1,
  })
})

describe('OrdersAdmin', () => {
  it('blocks staff without an order role and sends no request', () => {
    sessionState = {
      data: { user: { ...AGENT.user, roles: ['MARKETING'] } },
      status: 'authenticated',
    }
    wrap(<OrdersAdmin />)
    expect(screen.getByText(/don.t have permission to view orders/)).toBeInTheDocument()
    expect(api.listStaffOrders).not.toHaveBeenCalled()
  })

  it('lists orders with status, payment, total and a masked recipient', async () => {
    wrap(<OrdersAdmin />)
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByRole('link', { name: 'O-002' })).toHaveAttribute(
      'href',
      '/admin/orders/O-002'
    )
    expect(within(rows[1]).getByText('Binh T.')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Verifying payment')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/660\.000/)).toBeInTheDocument()
    expect(within(rows[2]).getByText('Confirmed')).toBeInTheDocument()
  })

  it('keeps the visually hidden table parts inside the scroll box', async () => {
    wrap(<OrdersAdmin />)
    const table = await screen.findByRole('table')
    expect(table.parentElement).toHaveClass('relative', 'overflow-x-auto')
  })

  it('filters by status (the service has no order search)', async () => {
    const user = userEvent.setup()
    wrap(<OrdersAdmin />)
    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Status'), 'UNKNOWN_HOLD')
    expect(api.listStaffOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'UNKNOWN_HOLD', page: 1 })
    )
    expect(screen.queryByLabelText('Search by order number')).not.toBeInTheDocument()
  })

  it('says when no order matches and when the list cannot load', async () => {
    api.listStaffOrders.mockResolvedValueOnce({ items: [], total: 0, pageCount: 1 })
    const first = wrap(<OrdersAdmin />)
    expect(await screen.findByText('No orders match.')).toBeInTheDocument()
    first.unmount()
    api.listStaffOrders.mockRejectedValue(new Error('boom'))
    wrap(<OrdersAdmin />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the orders/i)
  })
})

describe('OrderAdminDetail', () => {
  const detail = {
    orderId: 'O-002',
    status: 'FAILED_CLOSED',
    paymentStatus: 'REFUND_PENDING',
    failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
    totalPayableVnd: 660000,
    paymentAttemptId: 'PAY-O-002',
    createdAt: '2026-11-15T10:00:00.000Z',
    expiresAt: null,
    refundObligationVnd: 660000,
    subtotalVnd: 700000,
    discountVnd: 70000,
    shippingFeeVnd: 30000,
    voucherCode: 'WELCOME10',
    customerId: 'user-binh',
    warehouseId: 'WH-HCM-01',
    shipTo: {
      recipient: 'Binh T.',
      phone: '+84*******567',
      district: 'District 1',
      province: 'HCMC',
    },
    lines: [
      {
        skuId: 'A',
        skuName: 'City Backpack',
        imageUrl: null,
        quantity: 2,
        unitPriceVnd: 300000,
        lineSubtotalVnd: 600000,
        lineDiscountVnd: 60000,
        lineNetPayableVnd: 540000,
        allocatedUnitPaidVnd: 270000,
      },
    ],
  }

  it('shows payment facts, the refund owed, the snapshot and minimal customer data', async () => {
    api.getStaffOrder.mockResolvedValue(detail)
    wrap(<OrderAdminDetail orderId="O-002" />)
    expect(await screen.findByRole('heading', { name: 'Order O-002' })).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('Refund pending')).toBeInTheDocument()
    expect(screen.getByText('PAYMENT_UNKNOWN_EXPIRED')).toBeInTheDocument()
    expect(screen.getByText('Refund owed').nextSibling).toHaveTextContent('660.000')
    expect(
      within(screen.getByRole('list', { name: 'Items' })).getByText('City Backpack')
    ).toBeInTheDocument()
    expect(screen.getByText(/270\.000/)).toBeInTheDocument()
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('660.000')
    expect(screen.getByText(/\+84\*+567/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to orders' })).toHaveAttribute(
      'href',
      '/admin/orders'
    )
  })

  it('blocks staff without an order role', () => {
    sessionState = {
      data: { user: { ...AGENT.user, roles: ['MARKETING'] } },
      status: 'authenticated',
    }
    wrap(<OrderAdminDetail orderId="O-002" />)
    expect(screen.getByText(/don.t have permission to view orders/)).toBeInTheDocument()
    expect(api.getStaffOrder).not.toHaveBeenCalled()
  })

  it('shows an error when the order cannot be loaded', async () => {
    api.getStaffOrder.mockRejectedValue(new Error('404'))
    wrap(<OrderAdminDetail orderId="O-999" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this order/i)
  })
})
