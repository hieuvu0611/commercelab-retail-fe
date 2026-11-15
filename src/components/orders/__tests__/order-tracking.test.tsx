import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { OrderTracking as Tracking } from '@/types/fulfillment'
import { OrderTracking } from '../order-tracking'

const mockGet = jest.fn()
jest.mock('@/fulfillment/tracking-api', () => ({
  trackingKey: (id: string) => ['order-tracking', id],
  getOrderTracking: (id: string) => mockGet(id),
}))

const BASE: Tracking = {
  orderId: 'O-001',
  status: 'IN_TRANSIT',
  quantities: [{ skuId: 'BP-1', ordered: 2, dispatched: 2, delivered: 0, returned: 0 }],
  returnWindowEndsAt: null,
  events: [
    {
      time: '2026-11-15T10:00:00.000Z',
      label: 'Order confirmed',
      status: 'CONFIRMED',
    },
    { time: '2026-11-15T11:00:00.000Z', label: '', status: 'PACKING' },
    {
      time: '2026-11-16T08:00:00.000Z',
      label: 'Your parcel is on its way',
      status: 'IN_TRANSIT',
    },
  ],
}

function renderTracking(now = Date.parse('2026-11-17T00:00:00.000Z')) {
  jest.spyOn(Date, 'now').mockReturnValue(now)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrderTracking orderId="O-001" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue(BASE)
})
afterEach(() => jest.restoreAllMocks())

describe('OrderTracking', () => {
  it('lists the events newest first and words an event without a label from its status', async () => {
    renderTracking()
    const list = await screen.findByRole('list', { name: 'Tracking timeline' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Your parcel is on its way')
    expect(items[1]).toHaveTextContent('We are packing your order')
    expect(items[2]).toHaveTextContent('Order confirmed')
  })

  it('shows the latest status as the headline with the quantities per item', async () => {
    renderTracking()
    expect(await screen.findByText('On its way')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Quantities per item' })
    expect(within(table).getByRole('row', { name: /BP-1 2 2 0 0/ })).toBeInTheDocument()
  })

  it('tells the customer until when returns are open after delivery', async () => {
    mockGet.mockResolvedValue({
      ...BASE,
      status: 'DELIVERED',
      returnWindowEndsAt: '2026-11-24T08:00:00.000Z',
      events: [
        ...BASE.events,
        { time: '2026-11-17T08:00:00.000Z', label: 'Delivered', status: 'DELIVERED' },
      ],
    })
    renderTracking()
    expect(await screen.findByText(/returns open until 24 Nov 2026/i)).toBeInTheDocument()
  })

  it('says the return window has closed once its end has passed', async () => {
    mockGet.mockResolvedValue({
      ...BASE,
      status: 'DELIVERED',
      returnWindowEndsAt: '2026-11-24T08:00:00.000Z',
      events: [{ time: '2026-11-17T08:00:00.000Z', label: 'Delivered', status: 'DELIVERED' }],
    })
    renderTracking(Date.parse('2026-11-30T00:00:00.000Z'))
    expect(await screen.findByText(/return window closed on 24 Nov 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/returns open until/i)).not.toBeInTheDocument()
  })

  it('shows the failed delivery with the reason the service put in its sentence', async () => {
    mockGet.mockResolvedValue({
      ...BASE,
      status: 'DELIVERY_FAILED',
      events: [
        ...BASE.events,
        {
          time: '2026-11-17T08:00:00.000Z',
          label: 'Delivery failed: Recipient not available',
          status: 'DELIVERY_FAILED',
        },
      ],
    })
    renderTracking()
    expect(await screen.findByText('Delivery failed: Recipient not available')).toBeInTheDocument()
    expect(screen.queryByText(/returns open until/i)).not.toBeInTheDocument()
  })

  it('words the warehouse and exception statuses for the customer', async () => {
    mockGet.mockResolvedValue({
      ...BASE,
      status: 'PICK_BLOCKED',
      events: [{ time: '2026-11-15T10:00:00.000Z', label: '', status: 'PICK_BLOCKED' }],
    })
    renderTracking()
    expect(await screen.findByText('Being prepared')).toBeInTheDocument()
    expect(screen.getByText('We are checking stock for your order')).toBeInTheDocument()
  })

  it('explains that tracking starts later when the order has no shipment yet', async () => {
    mockGet.mockResolvedValue(null)
    renderTracking()
    expect(await screen.findByText(/tracking appears here/i)).toBeInTheDocument()
  })

  it('shows an error when the timeline cannot be loaded', async () => {
    mockGet.mockRejectedValue(new Error('500'))
    renderTracking()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the tracking/i)
  })
})
