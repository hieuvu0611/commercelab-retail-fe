import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toOrderDetail } from '@/orders/adapters'
import { ApiError } from '@/services/api/api-error'
import type { OrderDetail } from '@/types/order'
import { OrderDetailView } from '../order-detail-view'

const mockGet = jest.fn()
const mockCancel = jest.fn()
const mockTracking = jest.fn()
jest.mock('@/fulfillment/tracking-api', () => ({
  trackingKey: (id: string) => ['order-tracking', id],
  getOrderTracking: (id: string) => mockTracking(id),
}))
jest.mock('@/orders/order-api', () => ({
  ORDERS_KEY: ['orders'],
  orderDetailKey: (id: string) => ['order-detail', id],
  getOrderDetail: (id: string) => mockGet(id),
  cancelOrder: (...args: unknown[]) => mockCancel(...args),
}))
jest.mock('../order-tracking', () => ({
  OrderTracking: ({ orderId }: { orderId: string }) => <p>Tracking of {orderId}</p>,
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
  cancellation: null,
  refund: null,
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

  it('shows the delivery tracking of a confirmed order only', async () => {
    renderDetail()
    expect(await screen.findByText('Tracking of O-001')).toBeInTheDocument()
  })

  it('has no tracking for an order that is not confirmed', async () => {
    mockGet.mockResolvedValue({ ...DETAIL, status: 'RESERVED', paymentStatus: 'PROCESSING' })
    renderDetail()
    await screen.findByRole('list', { name: 'Items' })
    expect(screen.queryByText(/Tracking of/)).not.toBeInTheDocument()
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

describe('OrderDetailView cancellation', () => {
  beforeEach(() => mockTracking.mockResolvedValue({ status: 'PENDING_PICK' }))

  const openDialog = async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Cancel order' }))
    return user
  }

  beforeEach(() => {
    sessionStorage.clear()
    mockCancel.mockResolvedValue({
      ...DETAIL,
      status: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      cancellation: { status: 'CONFIRMED' },
      refund: { amountVnd: 660000, status: 'PENDING' },
    })
  })

  it('tells the customer the cancellation was refused once the parcel is with the carrier', async () => {
    // After a lost SC06 race the service puts the order back in fulfilment with no cancellation object.
    mockGet.mockResolvedValue({ ...DETAIL, status: 'IN_FULFILLMENT' })
    mockTracking.mockResolvedValue({ status: 'HANDED_OVER' })
    renderDetail()
    expect(
      await screen.findByText(/handed to the carrier, so the order could not be cancelled/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('offers cancel while the order can still be stopped and not otherwise', async () => {
    mockGet.mockResolvedValue({ ...DETAIL, status: 'DELIVERED' })
    renderDetail()
    await screen.findByRole('list', { name: 'Items' })
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('opens a confirmation with focus on the safe choice and closes on Escape, returning focus', async () => {
    const user = await openDialog()
    const dialog = screen.getByRole('alertdialog', { name: /cancel order O-001/i })
    expect(within(dialog).getByRole('button', { name: 'Keep order' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toHaveFocus()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the dialog', async () => {
    const user = await openDialog()
    const dialog = screen.getByRole('alertdialog')
    for (let step = 0; step < 6; step += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('keeps focus where the customer is when a reason is chosen', async () => {
    const user = await openDialog()
    const select = screen.getByLabelText('Reason')
    await user.selectOptions(select, 'OTHER')
    expect(select).toHaveFocus()
  })

  it('asks for a reason before sending anything', async () => {
    const user = await openDialog()
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a reason/i)
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('sends one request with the reason and a stable key, even when confirmed twice', async () => {
    let resolve: (value: unknown) => void = () => {}
    mockCancel.mockReturnValue(new Promise((done) => (resolve = done)))
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Reason'), 'CHANGED_MIND')
    const confirm = screen.getByRole('button', { name: 'Yes, cancel order' })
    await user.dblClick(confirm)
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockCancel).toHaveBeenCalledWith('O-001', 'CHANGED_MIND', expect.any(String))
    resolve({ ...DETAIL, status: 'CANCELLED', cancellation: { status: 'CONFIRMED' } })
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })

  it('reuses the key for a retry of the same order', async () => {
    mockCancel.mockRejectedValueOnce(new Error('network'))
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Reason'), 'OTHER')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    await screen.findByText(/safe to try again/i)
    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.selectOptions(screen.getByLabelText('Reason'), 'OTHER')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(2))
    expect(mockCancel.mock.calls[0][2]).toBe(mockCancel.mock.calls[1][2])
  })

  it('shows the cancelled order with the refund that is pending', async () => {
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Reason'), 'CHANGED_MIND')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText(/refund of .*660\.000.* is pending/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('keeps the order on screen when the service answers with the short cancel result', async () => {
    // The real POST /orders/{id}/cancel answers only id, status, payment status and refund (no dates, lines or address).
    mockCancel.mockResolvedValue(
      toOrderDetail({
        orderId: 'O-001',
        status: 'CANCELLED',
        paymentStatus: 'REFUND_PENDING',
        refundObligation: { amountVnd: 660000, refundedAmountVnd: 0, status: 'PENDING' },
      })
    )
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Reason'), 'CHANGED_MIND')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText(/refund of .*660\.000.* is pending/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Order O-001' })).toBeInTheDocument()
  })

  it('explains a refusal because the parcel was handed over and keeps the order as it was', async () => {
    mockCancel.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'ORDER_HANDED_OVER', message: 'x' })
    )
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Reason'), 'CHANGED_MIND')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/handed to the carrier/i)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('says the cancellation is not confirmed yet while the warehouse stops the parcel', async () => {
    mockGet.mockResolvedValue({
      ...DETAIL,
      status: 'CANCEL_REQUESTED',
      cancellation: { status: 'REQUESTED' },
    })
    renderDetail()
    expect(await screen.findByText('Awaiting warehouse confirmation')).toBeInTheDocument()
    expect(screen.getByText(/not cancelled yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('shows a completed refund', async () => {
    mockGet.mockResolvedValue({
      ...DETAIL,
      status: 'CANCELLED',
      cancellation: { status: 'CONFIRMED' },
      refund: { amountVnd: 660000, status: 'COMPLETED' },
    })
    renderDetail()
    expect(await screen.findByText(/refund of .*660\.000.* was completed/i)).toBeInTheDocument()
  })

  it('tells the customer to use returns after a refused cancellation', async () => {
    mockGet.mockResolvedValue({
      ...DETAIL,
      status: 'IN_FULFILLMENT',
      cancellation: { status: 'REFUSED' },
    })
    renderDetail()
    expect(await screen.findByText(/could not be cancelled/i)).toBeInTheDocument()
    expect(screen.getByText(/request a return/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })
})
