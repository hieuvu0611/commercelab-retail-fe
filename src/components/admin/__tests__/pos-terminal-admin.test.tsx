import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PosApiError } from '@/pos/types'
import type { PosCatalogItem, PosSaleReceipt, PosSaleSummary } from '@/pos/types'

const api = {
  createPosSale: jest.fn(),
  listPosSales: jest.fn(),
  searchPosCatalog: jest.fn(),
}
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/pos/pos-api', () => {
  const actualTypes = jest.requireActual('@/pos/types')
  return {
    PosApiError: actualTypes.PosApiError,
    POS_SALES_KEY: (warehouseId?: string) => ['pos-sales', warehouseId ?? 'all'] as const,
    POS_CATALOG_KEY: (query: string) => ['pos-catalog', query] as const,
    createPosSale: (...args: unknown[]) => api.createPosSale(...args),
    listPosSales: (...args: unknown[]) => api.listPosSales(...args),
    searchPosCatalog: (...args: unknown[]) => api.searchPosCatalog(...args),
  }
})

import { PosTerminalAdmin } from '../pos-terminal-admin'

const CATALOG_ITEMS: PosCatalogItem[] = [
  {
    skuId: 'BP-CITY-BLK-20L',
    name: 'City Backpack 20L',
    unitPriceVnd: 300000,
    availableByWarehouse: { 'WH-HCM-01': 70, 'WH-HN-01': 30 },
  },
  {
    skuId: 'WB-THERMO-SLV-500',
    name: 'Thermo Bottle 500ml',
    unitPriceVnd: 100000,
    availableByWarehouse: { 'WH-HCM-01': 50, 'WH-HN-01': 25 },
  },
]

const INITIAL_SALES: PosSaleSummary[] = [
  {
    orderId: 'ord-pos-seed-0001',
    receiptNumber: 'POS-HCM-0001',
    warehouseId: 'WH-HCM-01',
    paymentMethod: 'POS_CASH',
    totalVnd: 400000,
    itemCount: 2,
    createdAt: '2026-11-23T09:15:00.000Z',
    cashierId: 'usr-wh-hcm',
  },
]

const OPS_SESSION = {
  accessToken: 'ops-token',
  user: {
    id: 'usr-ops',
    name: 'Ops Manager',
    email: 'ops@commercelab.vn',
    roles: ['OPS_MGR'],
    warehouseScopes: ['*'],
  },
}

function renderTerminal() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PosTerminalAdmin />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  Object.values(api).forEach((mockFn) => mockFn.mockReset())
  sessionState = { data: OPS_SESSION, status: 'authenticated' }
  api.searchPosCatalog.mockResolvedValue(CATALOG_ITEMS)
  api.listPosSales.mockResolvedValue(INITIAL_SALES)
})

describe('PosTerminalAdmin', () => {
  it('blocks unauthorized staff roles such as MARKETING and FINANCE without calling POS APIs', () => {
    for (const deniedRole of ['MARKETING', 'FINANCE']) {
      sessionState = {
        data: {
          accessToken: 'denied-token',
          user: { ...OPS_SESSION.user, roles: [deniedRole] },
        },
        status: 'authenticated',
      }
      const { unmount } = renderTerminal()
      expect(
        screen.getByText(/don.t have permission to use the counter POS terminal/i)
      ).toBeInTheDocument()
      expect(api.searchPosCatalog).not.toHaveBeenCalled()
      expect(api.listPosSales).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('locks the store selector when staff warehouseScopes restricts them to one warehouse', async () => {
    sessionState = {
      data: {
        accessToken: 'wh-token',
        user: {
          id: 'usr-wh-hn',
          name: 'Hanoi Cashier',
          email: 'wh.hn@commercelab.vn',
          roles: ['WAREHOUSE_STAFF'],
          warehouseScopes: ['WH-HN-01'],
        },
      },
      status: 'authenticated',
    }

    renderTerminal()
    const selector = await screen.findByLabelText('Store / Warehouse')
    expect(selector).toBeDisabled()
    expect(selector).toHaveValue('WH-HN-01')
    expect(screen.getByText(/Locked to assigned store WH-HN-01/i)).toBeInTheDocument()
    expect(api.listPosSales).toHaveBeenCalledWith('WH-HN-01', 'wh-token')
  })

  it('adds SKUs to counter cart, adjusts quantity, and calculates live cash change due', async () => {
    const user = userEvent.setup()
    renderTerminal()

    const addBackpack = await screen.findByRole('button', { name: 'Add BP-CITY-BLK-20L' })
    await user.click(addBackpack)

    const cartList = screen.getByRole('list', { name: 'Counter cart items' })
    expect(within(cartList).getByText('City Backpack 20L')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Increase quantity for BP-CITY-BLK-20L' }))
    expect(within(cartList).getByText('2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Decrease quantity for BP-CITY-BLK-20L' }))
    expect(within(cartList).getByText('1')).toBeInTheDocument()

    const cashInput = screen.getByLabelText('Cash received (VND)')
    await user.type(cashInput, '200000')
    expect(screen.getByRole('alert')).toHaveTextContent(/Cash received is less than total due/i)
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled()

    await user.clear(cashInput)
    await user.type(cashInput, '500000')
    expect(screen.getByText(/Change due:/i)).toHaveTextContent(/200\.000/)
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeEnabled()
  })

  it('completes a POS cash sale, renders the receipt, and refreshes recent sales', async () => {
    const user = userEvent.setup()
    const createdReceipt: PosSaleReceipt = {
      orderId: 'ord-pos-0101',
      receiptNumber: 'POS-HCM-0101',
      channel: 'POS',
      warehouseId: 'WH-HCM-01',
      cashierId: 'usr-ops',
      paymentMethod: 'POS_CASH',
      paymentStatus: 'COLLECTED',
      status: 'DELIVERY_COMPLETE',
      subtotalVnd: 300000,
      totalVnd: 300000,
      cashReceivedVnd: 500000,
      changeDueVnd: 200000,
      items: [
        {
          skuId: 'BP-CITY-BLK-20L',
          name: 'City Backpack 20L',
          quantity: 1,
          unitPriceVnd: 300000,
          lineTotalVnd: 300000,
        },
      ],
      createdAt: '2026-11-23T14:00:00.000Z',
    }
    const updatedSales: PosSaleSummary[] = [
      {
        orderId: 'ord-pos-0101',
        receiptNumber: 'POS-HCM-0101',
        warehouseId: 'WH-HCM-01',
        paymentMethod: 'POS_CASH',
        totalVnd: 300000,
        itemCount: 1,
        createdAt: '2026-11-23T14:00:00.000Z',
        cashierId: 'usr-ops',
      },
      ...INITIAL_SALES,
    ]

    api.listPosSales.mockResolvedValueOnce(INITIAL_SALES).mockResolvedValue(updatedSales)
    api.createPosSale.mockResolvedValueOnce(createdReceipt)

    renderTerminal()

    await user.click(await screen.findByRole('button', { name: 'Add BP-CITY-BLK-20L' }))
    await user.type(screen.getByLabelText('Cash received (VND)'), '500000')
    await user.type(screen.getByLabelText('Customer note (optional)'), 'Walk-in receipt')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))

    expect(api.createPosSale).toHaveBeenCalledWith(
      {
        warehouseId: 'WH-HCM-01',
        paymentMethod: 'POS_CASH',
        customerNote: 'Walk-in receipt',
        cashReceivedVnd: 500000,
        items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 1 }],
      },
      expect.stringMatching(/^pos-/),
      'ops-token'
    )

    expect(
      await screen.findByRole('heading', { name: 'Receipt POS-HCM-0101' })
    ).toBeInTheDocument()
    const receiptSection = screen.getByRole('heading', { name: 'Receipt POS-HCM-0101' }).closest('section')!
    expect(within(receiptSection).getByText(/ord-pos-0101/)).toBeInTheDocument()
    expect(within(receiptSection).getByText(/200\.000/)).toBeInTheDocument()

    const table = await screen.findByRole('table')
    expect(await within(table).findByText('POS-HCM-0101')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start new sale' }))
    expect(screen.queryByRole('heading', { name: 'Receipt POS-HCM-0101' })).not.toBeInTheDocument()
  })

  it('surfaces INSUFFICIENT_STOCK errors cleanly and reuses the same idempotency key on retry', async () => {
    const user = userEvent.setup()
    api.createPosSale.mockRejectedValue(
      new PosApiError(409, 'INSUFFICIENT_STOCK', 'Only 0 units left for BP-CITY-BLK-20L')
    )

    renderTerminal()

    await user.click(await screen.findByRole('button', { name: 'Add BP-CITY-BLK-20L' }))
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('INSUFFICIENT_STOCK')
    expect(alert).toHaveTextContent('Only 0 units left for BP-CITY-BLK-20L')

    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(api.createPosSale).toHaveBeenCalledTimes(2)
    expect(api.createPosSale.mock.calls[0][1]).toBe(api.createPosSale.mock.calls[1][1])
  })
})
