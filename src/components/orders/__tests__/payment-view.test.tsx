import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Order } from '@/types/order'
import { PaymentView } from '../payment-view'

const mockGetOrder = jest.fn<Promise<Order>, [string]>()
const mockReport = jest.fn<Promise<Order>, [string, string]>()
jest.mock('@/orders/order-api', () => ({
  orderKey: (id: string) => ['order', id],
  getOrder: (id: string) => mockGetOrder(id),
  reportPaymentOutcome: (attempt: string, outcome: string) => mockReport(attempt, outcome),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const ORDER: Order = {
  orderId: 'O-001',
  status: 'RESERVED',
  paymentStatus: 'PROCESSING',
  failureCode: null,
  totalPayableVnd: 660000,
  paymentAttemptId: 'pay-O-001',
  createdAt: '2026-11-15T10:00:00.000Z',
  unknownDeadline: null,
  refundObligationVnd: 0,
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PaymentView orderId="O-001" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetOrder.mockResolvedValue(ORDER)
})

describe('PaymentView', () => {
  it('shows the amount to pay and the simulator while the payment is processing', async () => {
    renderView()
    expect(
      await screen.findByRole('heading', { name: 'Waiting for your payment' })
    ).toBeInTheDocument()
    expect(screen.getByText(/660\.000/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay successfully' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Payment fails' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Result unknown' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Late payment' })).not.toBeInTheDocument()
  })

  it('reports the chosen outcome and shows the confirmed order', async () => {
    const user = userEvent.setup()
    mockReport.mockResolvedValue({ ...ORDER, status: 'CONFIRMED', paymentStatus: 'CAPTURED' })
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Pay successfully' }))
    expect(mockReport).toHaveBeenCalledWith('pay-O-001', 'CAPTURED')
    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View your order' })).toHaveAttribute(
      'href',
      '/account/orders/O-001?placed=1'
    )
    expect(screen.queryByRole('button', { name: 'Pay successfully' })).not.toBeInTheDocument()
  })

  it('explains a failed payment and offers the way back to the cart', async () => {
    const user = userEvent.setup()
    mockReport.mockResolvedValue({
      ...ORDER,
      status: 'FAILED_CLOSED',
      paymentStatus: 'FAILED',
      failureCode: 'PAYMENT_FAILED',
    })
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Payment fails' }))
    expect(await screen.findByRole('heading', { name: 'Payment failed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to cart' })).toHaveAttribute('href', '/cart')
  })

  it('SC05: tells the customer not to pay again while unknown and removes the way to pay', async () => {
    const user = userEvent.setup()
    mockReport.mockResolvedValue({
      ...ORDER,
      status: 'UNKNOWN_HOLD',
      paymentStatus: 'UNKNOWN',
      unknownDeadline: '2026-11-15T10:30:00.000Z',
    })
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Result unknown' }))
    expect(
      await screen.findByRole('heading', { name: 'We are verifying your payment' })
    ).toBeInTheDocument()
    expect(screen.getByText(/do not pay again/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay successfully' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Payment fails' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Late payment' })).toBeInTheDocument()
  })

  it('SC05: shows the late payment as refunded and the order as not restored', async () => {
    mockGetOrder.mockResolvedValue({
      ...ORDER,
      status: 'FAILED_CLOSED',
      paymentStatus: 'CAPTURED_LATE',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      refundObligationVnd: 660000,
    })
    renderView()
    expect(
      await screen.findByRole('heading', { name: 'Your payment arrived too late' })
    ).toBeInTheDocument()
    expect(screen.getByText(/not restored/i)).toBeInTheDocument()
  })

  it('says when the order cannot be found', async () => {
    mockGetOrder.mockRejectedValue(new Error('404'))
    renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
  })

  it('keeps the simulator usable when reporting an outcome fails', async () => {
    const user = userEvent.setup()
    mockReport.mockRejectedValue(new Error('boom'))
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Pay successfully' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i))
    expect(screen.getByRole('button', { name: 'Pay successfully' })).toBeEnabled()
  })
})
