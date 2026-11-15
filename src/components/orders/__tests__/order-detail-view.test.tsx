import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { OrderDetail } from '@/types/order'
import { OrderDetailView } from '../order-detail-view'

const mockGet = jest.fn()
jest.mock('@/orders/order-api', () => ({
  orderDetailKey: (id: string) => ['order-detail', id],
  getOrderDetail: (id: string) => mockGet(id),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const DETAIL: OrderDetail = {
  orderId: 'O-001',
  status: 'CONFIRMED',
  paymentStatus: 'CAPTURED',
  failureCode: null,
  totalPayableVnd: 660000,
  paymentAttemptId: 'pay-O-001',
  createdAt: '2026-11-15T10:00:00.000Z',
  expiresAt: null,
  refundObligationVnd: 0,
  subtotalVnd: 700000,
  discountVnd: 70000,
  shippingFeeVnd: 30000,
  voucherCode: 'WELCOME10',
  address: {
    recipient: 'Lan Nguyen',
    phone: '+84901234567',
    line1: '12 Nguyen Hue',
    ward: 'Ben Nghe',
    district: 'District 1',
    province: 'Ho Chi Minh City',
  },
  lines: [
    {
      skuId: 'BP-1',
      skuName: 'City Backpack (Black / 20 L)',
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

function renderDetail(isNew = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrderDetailView orderId="O-001" isNew={isNew} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue(DETAIL)
})

describe('OrderDetailView', () => {
  it('shows the frozen lines with what was paid per unit and the totals', async () => {
    renderDetail()
    const lines = await screen.findByRole('list', { name: 'Items' })
    expect(within(lines).getByText('City Backpack (Black / 20 L)')).toBeInTheDocument()
    expect(within(lines).getByText(/2 × 300\.000/)).toBeInTheDocument()
    expect(within(lines).getByText(/270\.000/)).toBeInTheDocument()
    expect(screen.getByText('Goods').nextSibling).toHaveTextContent('700.000')
    expect(screen.getByText('Voucher WELCOME10').nextSibling).toHaveTextContent('70.000')
    expect(screen.getByText('Shipping').nextSibling).toHaveTextContent('30.000')
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('660.000')
  })

  it('shows the delivery address and the status', async () => {
    renderDetail()
    expect(await screen.findByText(/12 Nguyen Hue/)).toBeInTheDocument()
    expect(screen.getByText('Lan Nguyen')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('welcomes the customer on the confirmation page of a new confirmed order', async () => {
    renderDetail(true)
    expect(await screen.findByRole('heading', { name: /thank you/i })).toBeInTheDocument()
    expect(screen.getByText(/order O-001 is confirmed/i)).toBeInTheDocument()
  })

  it('does not show the confirmation banner when opening the order from history', async () => {
    renderDetail(false)
    await screen.findByRole('list', { name: 'Items' })
    expect(screen.queryByRole('heading', { name: /thank you/i })).not.toBeInTheDocument()
  })

  it('sends an unpaid order back to the payment page', async () => {
    mockGet.mockResolvedValue({ ...DETAIL, status: 'RESERVED', paymentStatus: 'PROCESSING' })
    renderDetail(true)
    expect(await screen.findByRole('link', { name: 'Continue to payment' })).toHaveAttribute(
      'href',
      '/checkout/payment/O-001'
    )
    expect(screen.queryByRole('heading', { name: /thank you/i })).not.toBeInTheDocument()
  })

  it('explains a refund for a late payment', async () => {
    mockGet.mockResolvedValue({
      ...DETAIL,
      status: 'FAILED_CLOSED',
      paymentStatus: 'REFUND_PENDING',
      refundObligationVnd: 660000,
    })
    renderDetail()
    expect(await screen.findByText(/refund/i)).toBeInTheDocument()
  })

  it('shows an error for an order that cannot be loaded', async () => {
    mockGet.mockRejectedValue(new Error('404'))
    renderDetail()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this order/i)
  })
})
