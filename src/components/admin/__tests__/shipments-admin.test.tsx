import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ShipmentRow } from '@/types/fulfillment'

const api = { listShipments: jest.fn() }
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/fulfillment/shipments-api', () => ({
  SHIPMENTS_KEY: ['staff-shipments'],
  listShipments: (...a: unknown[]) => api.listShipments(...a),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ShipmentsAdmin } from '../shipments-admin'

const user = (roles: string[], warehouseScopes: string[]) => ({
  data: { user: { id: 's', name: 'S', email: 's@x.vn', roles, warehouseScopes } },
  status: 'authenticated',
})
const row = (overrides: Partial<ShipmentRow> = {}): ShipmentRow => ({
  shipmentId: 'SHP-O-001',
  orderId: 'O-001',
  warehouseId: 'WH-HCM-01',
  status: 'PENDING_PICK',
  itemCount: 3,
  version: 1,
  createdAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
})

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShipmentsAdmin />
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  sessionState = user(['WAREHOUSE_STAFF'], ['WH-HCM-01'])
  api.listShipments.mockResolvedValue({ items: [row()], total: 1, pageCount: 1 })
})

describe('ShipmentsAdmin', () => {
  it('lists the shipments with a link to each pick list', async () => {
    wrap()
    const table = await screen.findByRole('table', { name: 'Shipments' })
    expect(within(table).getByRole('link', { name: 'SHP-O-001' })).toHaveAttribute(
      'href',
      '/admin/shipments/SHP-O-001'
    )
    expect(within(table).getByText('Waiting to be picked')).toBeInTheDocument()
    expect(within(table).getByText('WH-HCM-01')).toBeInTheDocument()
  })

  it('tells a staff member of one warehouse which warehouse they see', async () => {
    wrap()
    await screen.findByRole('table')
    expect(screen.getByText(/Showing warehouse WH-HCM-01/)).toBeInTheDocument()
    expect(screen.queryByText(/WH-HN-01/)).not.toBeInTheDocument()
  })

  it('asks the service for the chosen status', async () => {
    wrap()
    await screen.findByRole('table')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'PICK_BLOCKED')
    expect(api.listShipments).toHaveBeenLastCalledWith({
      status: 'PICK_BLOCKED',
      page: 1,
      limit: 15,
    })
  })

  it('shows an empty state', async () => {
    api.listShipments.mockResolvedValue({ items: [], total: 0, pageCount: 1 })
    wrap()
    expect(await screen.findByText('No shipments match.')).toBeInTheDocument()
  })

  it('keeps people without a warehouse role out', () => {
    sessionState = user(['SUPPORT_AGENT'], [])
    wrap()
    expect(screen.getByText(/don.t have permission to work the shipment queue/)).toBeInTheDocument()
    expect(api.listShipments).not.toHaveBeenCalled()
  })
})
