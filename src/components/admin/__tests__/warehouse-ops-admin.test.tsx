import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  PurchaseOrder,
  ReceivingInspection,
  StockAdjustment,
  Stocktake,
  SupplierReturn,
} from '@/types/procurement'

let sessionState: { data: unknown; status: string }
const mockListPO = jest.fn()
const mockListInspections = jest.fn()
const mockRecordInspection = jest.fn()
const mockListReturns = jest.fn()
const mockCreateReturn = jest.fn()
const mockDispatchReturn = jest.fn()
const mockListStocktakes = jest.fn()
const mockCreateStocktake = jest.fn()
const mockSubmitCount = jest.fn()
const mockListAdjustments = jest.fn()
const mockDecideAdjustment = jest.fn()
const mockListSuppliers = jest.fn()

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/admin/inventory/receiving' }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

jest.mock('@/procurement/procurement-api', () => ({
  RECEIVING_INSPECTIONS_KEY: ['receiving-inspections'],
  PURCHASE_ORDERS_KEY: ['procurement-orders'],
  SUPPLIER_RETURNS_KEY: ['supplier-returns'],
  SUPPLIERS_KEY: ['procurement-suppliers'],
  STOCKTAKES_KEY: ['inventory-stocktakes'],
  STOCK_ADJUSTMENTS_KEY: ['inventory-adjustments'],
  listPurchaseOrders: (...args: unknown[]) => mockListPO(...args),
  listReceivingInspections: (...args: unknown[]) => mockListInspections(...args),
  recordReceivingInspection: (...args: unknown[]) => mockRecordInspection(...args),
  listSupplierReturns: (...args: unknown[]) => mockListReturns(...args),
  createSupplierReturn: (...args: unknown[]) => mockCreateReturn(...args),
  dispatchSupplierReturn: (...args: unknown[]) => mockDispatchReturn(...args),
  listStocktakes: (...args: unknown[]) => mockListStocktakes(...args),
  createStocktake: (...args: unknown[]) => mockCreateStocktake(...args),
  submitStocktakeCount: (...args: unknown[]) => mockSubmitCount(...args),
  listStockAdjustments: (...args: unknown[]) => mockListAdjustments(...args),
  decideStockAdjustment: (...args: unknown[]) => mockDecideAdjustment(...args),
  listSuppliers: (...args: unknown[]) => mockListSuppliers(...args),
}))

import { ReceivingAdmin } from '../receiving-admin'
import { SupplierReturnsAdmin } from '../supplier-returns-admin'
import { StocktakesAdmin } from '../stocktakes-admin'
import { AdjustmentsAdmin } from '../adjustments-admin'

const STAFF = {
  user: {
    id: 'wh-manager-01',
    name: 'Warehouse Manager',
    email: 'wh@shop.vn',
    roles: ['WAREHOUSE_MGR'],
    warehouseScopes: ['ALL'],
  },
}

const sampleApprovedPO: PurchaseOrder = {
  poId: 'PO-SC09-100',
  supplierId: 'SUP-01',
  supplierName: 'Everest Outdoor',
  warehouseId: 'WH-HCM-01',
  status: 'APPROVED',
  totalAmountVnd: 20_000_000,
  createdBy: 'proc-user',
  notes: 'Order 100 units for SC09 test',
  lines: [
    {
      skuId: 'SKU-BACKPACK-BLK',
      orderedQty: 100,
      unitCostVnd: 200_000,
      receivedQty: 0,
      damagedQty: 0,
      shortQty: 0,
    },
  ],
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
}

const sampleInspection: ReceivingInspection = {
  inspectionId: 'INSP-001',
  poId: 'PO-SC09-100',
  warehouseId: 'WH-HCM-01',
  inspectorId: 'wh-inspector',
  status: 'COMPLETED',
  notes: 'Received 90, 5 damaged, 10 short',
  lines: [
    {
      skuId: 'SKU-BACKPACK-BLK',
      deliveredQty: 90,
      passedQty: 85,
      damagedQty: 5,
      shortQty: 10,
    },
  ],
  createdAt: '2026-11-16T10:30:00.000Z',
}

const sampleSupplierReturn: SupplierReturn = {
  returnId: 'RTV-001',
  supplierId: 'SUP-01',
  supplierName: 'Everest Outdoor',
  warehouseId: 'WH-HCM-01',
  status: 'DRAFT',
  createdBy: 'wh-staff',
  notes: 'Defective units from SC09 receiving',
  lines: [
    {
      skuId: 'SKU-BACKPACK-BLK',
      quantity: 5,
      reason: 'Damaged on delivery',
    },
  ],
  createdAt: '2026-11-16T11:00:00.000Z',
  updatedAt: '2026-11-16T11:00:00.000Z',
}

const sampleStocktake: Stocktake = {
  stocktakeId: 'STK-001',
  warehouseId: 'WH-HCM-01',
  status: 'IN_PROGRESS',
  startedBy: 'wh-counter-01',
  notes: 'Audit',
  lines: [],
  createdAt: '2026-11-16T11:30:00.000Z',
}

const sampleAdjustment: StockAdjustment = {
  adjustmentId: 'ADJ-001',
  stocktakeId: 'STK-001',
  warehouseId: 'WH-HCM-01',
  skuId: 'SKU-BACKPACK-BLK',
  diffQty: -3,
  unitCostVnd: 200_000,
  diffAmountVnd: -600_000,
  status: 'PENDING_APPROVAL',
  makerId: 'wh-counter-01',
  reason: 'Cycle count shortage',
  createdAt: '2026-11-16T12:00:00.000Z',
}

describe('Warehouse Operations Admin Components (P9-T06)', () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    sessionState = { data: STAFF, status: 'authenticated' }
    mockListPO.mockReset()
    mockListInspections.mockReset()
    mockRecordInspection.mockReset()
    mockListReturns.mockReset()
    mockCreateReturn.mockReset()
    mockDispatchReturn.mockReset()
    mockListStocktakes.mockReset()
    mockCreateStocktake.mockReset()
    mockSubmitCount.mockReset()
    mockListAdjustments.mockReset()
    mockDecideAdjustment.mockReset()
    mockListSuppliers.mockReset()
  })

  test('ReceivingAdmin displays approved POs and SC09 receiving form', async () => {
    mockListInspections.mockResolvedValue([sampleInspection])
    mockListPO.mockResolvedValue([sampleApprovedPO])

    render(
      <QueryClientProvider client={client}>
        <ReceivingAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Inbound Receiving & QC')).toBeInTheDocument()
      expect(screen.getAllByText('PO-SC09-100').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('INSP-001')).toBeInTheDocument()
    })

    // Click "Receive & Inspect (SC09)"
    const receiveBtn = screen.getByRole('button', { name: /Receive & Inspect \(SC09\)/i })
    fireEvent.click(receiveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Inbound QC Inspection: PO-SC09-100/i)).toBeInTheDocument()
      expect(screen.getByText(/Standard SC09 Receiving Invariant/i)).toBeInTheDocument()
    })
  })

  test('SupplierReturnsAdmin lists returns and opens dispatch modal', async () => {
    mockListReturns.mockResolvedValue([sampleSupplierReturn])
    mockListSuppliers.mockResolvedValue([])

    render(
      <QueryClientProvider client={client}>
        <SupplierReturnsAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Supplier Returns (RTV)')).toBeInTheDocument()
      expect(screen.getByText('RTV-001')).toBeInTheDocument()
      expect(screen.getByText('DRAFT')).toBeInTheDocument()
    })

    // Click dispatch
    const dispatchBtn = screen.getByRole('button', { name: /Dispatch Return/i })
    fireEvent.click(dispatchBtn)

    await waitFor(() => {
      expect(screen.getByText(/Dispatch Return: RTV-001/i)).toBeInTheDocument()
      expect(screen.getByText(/Confirm physical dispatch/i)).toBeInTheDocument()
    })
  })

  test('StocktakesAdmin alerts on count shortage and blocks sales', async () => {
    mockListStocktakes.mockResolvedValue([sampleStocktake])

    render(
      <QueryClientProvider client={client}>
        <StocktakesAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Warehouse Stocktakes')).toBeInTheDocument()
      expect(screen.getByText('STK-001')).toBeInTheDocument()
    })

    // Click Enter Counts
    const countBtn = screen.getByRole('button', { name: /Enter Counts/i })
    fireEvent.click(countBtn)

    await waitFor(() => {
      expect(screen.getByText(/Enter Physical Counts: STK-001/i)).toBeInTheDocument()
      // Shows shortage sales-block tag
      expect(screen.getByText(/🔒 Sales Blocked for Discrepancy/i)).toBeInTheDocument()
    })
  })

  test('AdjustmentsAdmin enforces P10 Maker != Checker for adjustment creator', async () => {
    mockListAdjustments.mockResolvedValue([sampleAdjustment])
    // User is the maker
    sessionState = {
      data: {
        user: {
          id: 'wh-counter-01',
          name: 'Counter',
          email: 'counter@shop.vn',
          roles: ['WAREHOUSE_MGR'],
          warehouseScopes: ['ALL'],
        },
      },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={client}>
        <AdjustmentsAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Inventory Adjustments Queue')).toBeInTheDocument()
      expect(screen.getByText('ADJ-001')).toBeInTheDocument()
      // Self-approval blocked
      const blockedBtn = screen.getByRole('button', { name: /Self-Approval Blocked \(P10\)/i })
      expect(blockedBtn).toBeDisabled()
    })
  })

  test('AdjustmentsAdmin allows approval for second manager', async () => {
    mockListAdjustments.mockResolvedValue([sampleAdjustment])
    // User is a different manager
    sessionState = {
      data: {
        user: {
          id: 'ops-director-02',
          name: 'Ops Director',
          email: 'ops@shop.vn',
          roles: ['OPS_MGR'],
          warehouseScopes: ['ALL'],
        },
      },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={client}>
        <AdjustmentsAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('ADJ-001')).toBeInTheDocument()
      const approveBtn = screen.getByRole('button', { name: /^Approve$/i })
      expect(approveBtn).not.toBeDisabled()
    })
  })

  test('AdjustmentsAdmin denies ACCESS_ADMIN per RBAC boundary', () => {
    sessionState = {
      data: {
        user: {
          id: 'access-01',
          name: 'Access Admin',
          email: 'access@shop.vn',
          roles: ['ACCESS_ADMIN'],
          warehouseScopes: ['ALL'],
        },
      },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={client}>
        <AdjustmentsAdmin />
      </QueryClientProvider>
    )

    expect(
      screen.getByText(/don't have permission to review and approve inventory adjustments/i)
    ).toBeInTheDocument()
  })
})
