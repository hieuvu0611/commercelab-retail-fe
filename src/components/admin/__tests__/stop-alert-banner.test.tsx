import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import type { StopAlert, StopResolution } from '@/types/cancellation'

const api = { confirmStop: jest.fn(), getShipment: jest.fn() }
const alertsState: {
  alerts: StopAlert[]
  resolutions: StopResolution[]
  status: 'connecting' | 'live' | 'reconnecting'
  resolveHere: jest.Mock
  dismiss: jest.Mock
} = { alerts: [], resolutions: [], status: 'live', resolveHere: jest.fn(), dismiss: jest.fn() }
const hookCalls: string[][] = []
let sessionState: { data: unknown }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/fulfillment/shipments-api', () => ({
  SHIPMENTS_KEY: ['staff-shipments'],
  shipmentKey: (id: string) => ['staff-shipment', id],
  confirmStop: (...a: unknown[]) => api.confirmStop(...a),
  getShipment: (...a: unknown[]) => api.getShipment(...a),
}))
jest.mock('@/fulfillment/use-stop-alerts', () => ({
  useStopAlerts: (warehouses: string[]) => {
    hookCalls.push(warehouses)
    return alertsState
  },
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { StopAlertBanner } from '../stop-alert-banner'

const alert = (orderId = 'O-005'): StopAlert => ({
  orderId,
  shipmentId: `SHP-${orderId}`,
  warehouseId: 'WH-HCM-01',
  requestedAt: '2026-11-15T10:00:00.000Z',
})

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StopAlertBanner />
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  hookCalls.length = 0
  Object.assign(alertsState, { alerts: [], resolutions: [], status: 'live' })
  sessionState = {
    data: { user: { roles: ['WAREHOUSE_STAFF'], warehouseScopes: ['WH-HCM-01'] } },
  }
})

const openConfirm = async () => {
  const user = userEvent.setup()
  alertsState.alerts = [alert()]
  wrap()
  await user.click(screen.getByRole('button', { name: 'Confirm packing stopped' }))
  return user
}

describe('StopAlertBanner', () => {
  it('shows nothing while there is no alert and the stream is live', () => {
    const { container } = wrap()
    expect(container).toBeEmptyDOMElement()
  })

  it('listens only to the warehouses of the signed-in person', () => {
    wrap()
    expect(hookCalls.at(-1)).toEqual(['WH-HCM-01'])
  })

  it('announces an alert with the order, the shipment link and the action', () => {
    alertsState.alerts = [alert()]
    wrap()
    const region = screen.getByRole('alert')
    expect(
      within(region).getByRole('heading', { name: /stop packing order O-005/i })
    ).toBeInTheDocument()
    expect(within(region).getByText(/WH-HCM-01/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Open shipment SHP-O-005' })).toHaveAttribute(
      'href',
      '/admin/shipments/SHP-O-005'
    )
  })

  it('keeps the alert while the connection is down and says that it is reconnecting', () => {
    alertsState.alerts = [alert()]
    alertsState.status = 'reconnecting'
    wrap()
    expect(screen.getByRole('status')).toHaveTextContent(/reconnecting/i)
    expect(screen.getByRole('heading', { name: /stop packing order O-005/i })).toBeInTheDocument()
  })

  it('warns about missed alerts even when none is open', () => {
    alertsState.status = 'reconnecting'
    wrap()
    expect(screen.getByRole('status')).toHaveTextContent(/new alerts may be delayed/i)
  })

  it('asks before confirming, with focus on the safe choice, and Escape changes nothing', async () => {
    const user = await openConfirm()
    const dialog = screen.getByRole('alertdialog', { name: /confirm packing has stopped/i })
    expect(within(dialog).getByRole('button', { name: 'Not yet' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm packing stopped' })).toHaveFocus()
    expect(api.confirmStop).not.toHaveBeenCalled()
  })

  it('confirms once even when pressed twice, then reports the order as stopped', async () => {
    api.confirmStop.mockResolvedValue({})
    const user = await openConfirm()
    await user.dblClick(screen.getByRole('button', { name: 'Yes, packing has stopped' }))
    await waitFor(() => expect(alertsState.resolveHere).toHaveBeenCalled())
    expect(api.confirmStop).toHaveBeenCalledTimes(1)
    expect(api.confirmStop).toHaveBeenCalledWith('SHP-O-005')
    expect(alertsState.resolveHere).toHaveBeenCalledWith({
      orderId: 'O-005',
      shipmentId: 'SHP-O-005',
      outcome: 'STOPPED',
    })
  })

  it('reads a refusal because the parcel already left as a resolution, not as an error', async () => {
    api.confirmStop.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 409,
        code: 'SHIPMENT_ALREADY_HANDED_OVER',
        message: 'x',
      })
    )
    api.getShipment.mockResolvedValue({ status: 'HANDED_OVER' })
    const user = await openConfirm()
    await user.click(screen.getByRole('button', { name: 'Yes, packing has stopped' }))
    await waitFor(() =>
      expect(alertsState.resolveHere).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'O-005', outcome: 'HANDED_OVER' })
      )
    )
  })

  it('keeps the alert and says so when confirming fails for another reason', async () => {
    api.confirmStop.mockRejectedValue(new Error('network'))
    api.getShipment.mockResolvedValue({ status: 'PICKING' })
    const user = await openConfirm()
    await user.click(screen.getByRole('button', { name: 'Yes, packing has stopped' }))
    expect(await screen.findByText(/could not confirm the stop/i)).toBeInTheDocument()
    expect(alertsState.resolveHere).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /stop packing order O-005/i })).toBeInTheDocument()
  })

  it('tells how each alert ended and lets the person dismiss the note', async () => {
    alertsState.resolutions = [
      { orderId: 'O-005', shipmentId: 'SHP-O-005', outcome: 'STOPPED' },
      { orderId: 'O-007', shipmentId: 'SHP-O-007', outcome: 'HANDED_OVER' },
    ]
    wrap()
    expect(screen.getByText(/O-005: packing stopped/i)).toBeInTheDocument()
    expect(screen.getByText(/O-007: .*handed over first/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])
    expect(alertsState.dismiss).toHaveBeenCalledWith('O-005')
  })
})
