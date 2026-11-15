import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import type { ShipmentDetail } from '@/types/fulfillment'

const api = {
  getShipment: jest.fn(),
  scanSku: jest.fn(),
  packShipment: jest.fn(),
  handOverShipment: jest.fn(),
  reportShortage: jest.fn(),
}
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/fulfillment/shipments-api', () => ({
  SHIPMENTS_KEY: ['staff-shipments'],
  shipmentKey: (id: string) => ['staff-shipment', id],
  getShipment: (...a: unknown[]) => api.getShipment(...a),
  scanSku: (...a: unknown[]) => api.scanSku(...a),
  packShipment: (...a: unknown[]) => api.packShipment(...a),
  handOverShipment: (...a: unknown[]) => api.handOverShipment(...a),
  reportShortage: (...a: unknown[]) => api.reportShortage(...a),
}))
jest.mock('../stop-alert-banner', () => ({ StopAlertBanner: () => null }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ShipmentAdminDetail } from '../shipment-detail'

const apiError = (code: string, status = 422) =>
  new ApiError({ kind: 'http', status, code, message: code })

const shipment = (overrides: Partial<ShipmentDetail> = {}): ShipmentDetail => ({
  shipmentId: 'SHP-O-001',
  orderId: 'O-001',
  warehouseId: 'WH-HCM-01',
  status: 'PENDING_PICK',
  itemCount: 3,
  version: 1,
  createdAt: '2026-11-15T10:00:00.000Z',
  handedOverAt: null,
  deliveredAt: null,
  returnWindowEndsAt: null,
  failureReason: null,
  lines: [
    { skuId: 'BP-1', orderedQuantity: 2, pickedQuantity: 0 },
    { skuId: 'BT-1', orderedQuantity: 1, pickedQuantity: 0 },
  ],
  ...overrides,
})
const picked = (): ShipmentDetail =>
  shipment({
    status: 'PICKING',
    version: 3,
    lines: [
      { skuId: 'BP-1', orderedQuantity: 2, pickedQuantity: 2 },
      { skuId: 'BT-1', orderedQuantity: 1, pickedQuantity: 1 },
    ],
  })

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShipmentAdminDetail shipmentId="SHP-O-001" />
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  sessionState = {
    data: {
      user: {
        id: 's',
        name: 'S',
        email: 's@x.vn',
        roles: ['WAREHOUSE_STAFF'],
        warehouseScopes: ['WH-HCM-01'],
      },
    },
    status: 'authenticated',
  }
  api.getShipment.mockResolvedValue(shipment())
})

const scanBox = () => screen.findByLabelText('SKU code')

describe('ShipmentAdminDetail', () => {
  it('shows the pick list and puts the cursor in the scan box', async () => {
    wrap()
    const input = await scanBox()
    expect(input).toHaveFocus()
    const table = screen.getByRole('table', { name: 'Pick list' })
    expect(within(table).getByText('BP-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as packed' })).toBeDisabled()
  })

  it('verifies a typed code with the quantity and the version it saw, then clears the box', async () => {
    api.scanSku.mockResolvedValue(shipment({ status: 'PICKING', version: 2 }))
    wrap()
    const input = await scanBox()
    await userEvent.type(input, '  BP-1 {Enter}')
    await waitFor(() =>
      expect(api.scanSku).toHaveBeenCalledWith('SHP-O-001', {
        skuId: 'BP-1',
        quantity: 1,
        version: 1,
      })
    )
    expect(await screen.findByText('Picked 1 × BP-1')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('does not call the service for an empty code or a bad quantity', async () => {
    wrap()
    await scanBox()
    await userEvent.click(screen.getByRole('button', { name: 'Verify and pick' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/scan or type a sku code/i)
    await userEvent.type(screen.getByLabelText('SKU code'), 'BP-1')
    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and pick' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/whole number/i)
    expect(api.scanSku).not.toHaveBeenCalled()
  })

  it('explains a code that is not on the pick list and keeps what was typed', async () => {
    api.scanSku.mockRejectedValue(apiError('SKU_NOT_ON_PICK_LIST'))
    wrap()
    const input = await scanBox()
    await userEvent.type(input, 'NOPE{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/not on this pick list/i)
    expect(input).toHaveValue('NOPE')
  })

  it('reloads the shipment when the version was stale', async () => {
    api.scanSku.mockRejectedValue(apiError('STALE_VERSION', 409))
    wrap()
    await userEvent.type(await scanBox(), 'BP-1{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/someone else changed/i)
    await waitFor(() => expect(api.getShipment).toHaveBeenCalledTimes(2))
  })

  it('packs once every line is picked', async () => {
    api.getShipment.mockResolvedValue(picked())
    api.packShipment.mockResolvedValue({ ...picked(), status: 'PACKED', version: 4 })
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as packed' }))
    expect(api.packShipment).toHaveBeenCalledWith('SHP-O-001', 3)
    expect(await screen.findByText('Shipment packed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hand over to carrier' })).toBeInTheDocument()
    expect(screen.queryByLabelText('SKU code')).not.toBeInTheDocument()
  })

  it('asks before handing over, and Escape cancels without handing over', async () => {
    api.getShipment.mockResolvedValue({ ...picked(), status: 'PACKED' })
    api.handOverShipment.mockResolvedValue({
      ...picked(),
      status: 'HANDED_OVER',
      handedOverAt: '2026-11-15T12:00:00.000Z',
    })
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over to carrier' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.handOverShipment).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Hand over to carrier' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Hand over' })
    )
    expect(api.handOverShipment).toHaveBeenCalledWith('SHP-O-001', 3)
    expect(await screen.findByText('Shipment handed to the carrier')).toBeInTheDocument()
  })

  it('reports a shortage with a reason and shows the shipment as blocked', async () => {
    api.reportShortage.mockResolvedValue(
      shipment({
        status: 'PICK_BLOCKED',
        version: 2,
        failureReason: 'Damaged',
      })
    )
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: 'Report a shortage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Block shipment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/say what is wrong/i)
    await userEvent.type(screen.getByLabelText('Reason'), 'Damaged')
    await userEvent.click(screen.getByRole('button', { name: 'Block shipment' }))
    expect(api.reportShortage).toHaveBeenCalledWith('SHP-O-001', {
      skuId: 'BP-1',
      quantity: 2,
      reason: 'Damaged',
      version: 1,
    })
    expect(await screen.findByText(/Shortage reported: Damaged/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as packed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hand over to carrier' })).not.toBeInTheDocument()
  })

  it('closes the shortage panel with Escape', async () => {
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: 'Report a shortage' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Report a shortage' })).not.toBeInTheDocument()
  })

  it('explains a shipment of another warehouse', async () => {
    api.getShipment.mockRejectedValue(apiError('FORBIDDEN_WAREHOUSE_SCOPE', 403))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent(/outside your access/i)
    expect(screen.getByRole('link', { name: 'Back to shipments' })).toBeInTheDocument()
  })
})
