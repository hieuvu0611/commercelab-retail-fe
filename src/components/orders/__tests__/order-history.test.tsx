import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrderSummary } from '@/types/order'
import { OrderHistory } from '../order-history'

const mockList = jest.fn()
jest.mock('@/orders/order-api', () => ({
  ORDERS_KEY: ['orders'],
  listOrders: (...args: unknown[]) => mockList(...args),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const row = (overrides: Partial<OrderSummary>): OrderSummary => ({
  orderId: 'O-002',
  status: 'CONFIRMED',
  paymentStatus: 'CAPTURED',
  totalPayableVnd: 660000,
  createdAt: '2026-11-15T10:00:00.000Z',
  itemCount: 3,
  ...overrides,
})

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrderHistory />
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('OrderHistory', () => {
  it('lists orders with status, total and a link to the detail', async () => {
    mockList.mockResolvedValue({
      items: [row({}), row({ orderId: 'O-001', status: 'FAILED_CLOSED', itemCount: 1 })],
      total: 2,
      pageCount: 1,
    })
    renderHistory()
    const list = await screen.findByRole('list', { name: 'Your orders' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('link', { name: /O-002/ })).toHaveAttribute(
      'href',
      '/account/orders/O-002'
    )
    expect(within(items[0]).getByText('Confirmed')).toBeInTheDocument()
    expect(within(items[0]).getByText(/660\.000/)).toBeInTheDocument()
    expect(within(items[0]).getByText(/3 items/)).toBeInTheDocument()
    expect(within(items[1]).getByText('Closed')).toBeInTheDocument()
    expect(within(items[1]).getByText(/1 item/)).toBeInTheDocument()
  })

  it('says so when there are no orders yet', async () => {
    mockList.mockResolvedValue({ items: [], total: 0, pageCount: 1 })
    renderHistory()
    expect(await screen.findByText(/have not placed an order/i)).toBeInTheDocument()
  })

  it('pages through the history', async () => {
    const user = userEvent.setup()
    mockList.mockResolvedValue({ items: [row({})], total: 20, pageCount: 2 })
    renderHistory()
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(mockList).toHaveBeenLastCalledWith({ page: 2, limit: 10 })
  })

  it('shows an error when the history cannot be loaded', async () => {
    mockList.mockRejectedValue(new Error('boom'))
    renderHistory()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your orders/i)
  })
})
