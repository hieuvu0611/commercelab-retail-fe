import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PurchaseOrder } from '@/types/procurement'

let sessionState: { data: unknown; status: string }
const mockListPO = jest.fn()
const mockGetPO = jest.fn()
const mockListSuppliers = jest.fn()

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

jest.mock('@/procurement/procurement-api', () => ({
  PURCHASE_ORDERS_KEY: ['procurement-orders'],
  SUPPLIERS_KEY: ['procurement-suppliers'],
  purchaseOrderKey: (poId: string) => ['procurement-order', poId],
  listPurchaseOrders: (...args: unknown[]) => mockListPO(...args),
  getPurchaseOrder: (...args: unknown[]) => mockGetPO(...args),
  listSuppliers: (...args: unknown[]) => mockListSuppliers(...args),
  approvePurchaseOrder: jest.fn(),
  rejectPurchaseOrder: jest.fn(),
  createPurchaseOrder: jest.fn(),
}))

import { PurchasingOrdersAdmin } from '../purchasing-orders-admin'
import { PurchasingOrderDetail } from '../purchasing-order-detail'
import { PurchasingOrderNew } from '../purchasing-order-new'
import { SuppliersAdmin } from '../suppliers-admin'

const STAFF = {
  user: { id: 's1', name: 'Procurement Manager', email: 'proc@shop.vn', roles: ['PROCUREMENT_MGR'], warehouseScopes: ['ALL'] },
}

const samplePO: PurchaseOrder = {
  poId: 'PO-TEST-001',
  supplierId: 'SUP-EVEREST-01',
  supplierName: 'Everest Outdoor Gear Co.',
  warehouseId: 'WH-HCM-01',
  status: 'PENDING_APPROVAL',
  totalAmountVnd: 15_000_000,
  createdBy: 'user-creator-01',
  notes: 'Winter stock',
  lines: [
    {
      skuId: 'SKU-BACKPACK-BLK',
      orderedQty: 100,
      unitCostVnd: 150_000,
      receivedQty: 0,
      damagedQty: 0,
      shortQty: 0,
    },
  ],
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
}

describe('Purchasing Admin Components', () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    sessionState = { data: STAFF, status: 'authenticated' }
    mockListPO.mockReset()
    mockGetPO.mockReset()
    mockListSuppliers.mockReset()
  })

  test('PurchasingOrdersAdmin lists orders and status badges', async () => {
    mockListPO.mockResolvedValue([samplePO])

    render(
      <QueryClientProvider client={client}>
        <PurchasingOrdersAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Purchase Orders')).toBeInTheDocument()
      expect(screen.getByText('PO-TEST-001')).toBeInTheDocument()
      expect(screen.getAllByText('Pending Approval').length).toBeGreaterThan(0)
    })
  })

  test('PurchasingOrderNew renders form and calculates totals', async () => {
    mockListSuppliers.mockResolvedValue([
      { supplierId: 'SUP-EVEREST-01', name: 'Everest Outdoor Gear Co.', code: 'EVEREST', active: true },
    ])

    render(
      <QueryClientProvider client={client}>
        <PurchasingOrderNew />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('New Purchase Order')).toBeInTheDocument()
      expect(screen.getByText('Total PO Amount:')).toBeInTheDocument()
      expect(screen.getByText(/Standard Purchase Order \(≤ 20,000,000 VND\)/)).toBeInTheDocument()
    })
  })

  test('PurchasingOrderDetail enforces P10 Maker != Checker for creator', async () => {
    mockGetPO.mockResolvedValue(samplePO)
    // Current user is the creator
    sessionState = {
      data: {
        user: { id: 'user-creator-01', name: 'Creator', email: 'c@shop.vn', roles: ['PROCUREMENT_MGR'], warehouseScopes: ['ALL'] },
      },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={client}>
        <PurchasingOrderDetail poId="PO-TEST-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('PO-TEST-001')).toBeInTheDocument()
      // P10 alert shown
      expect(screen.getByText(/Policy P10 \(Maker ≠ Checker\)/)).toBeInTheDocument()
      // Self-approval button is disabled
      const approveBtn = screen.getByRole('button', { name: /Self-Approval Blocked \(P10\)/i })
      expect(approveBtn).toBeDisabled()
    })
  })

  test('PurchasingOrderDetail allows approval for different manager', async () => {
    mockGetPO.mockResolvedValue(samplePO)
    // Current user is a different manager (checker)
    sessionState = {
      data: {
        user: { id: 'checker-manager-01', name: 'Checker', email: 'chk@shop.vn', roles: ['OPS_DIRECTOR'], warehouseScopes: ['ALL'] },
      },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={client}>
        <PurchasingOrderDetail poId="PO-TEST-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('PO-TEST-001')).toBeInTheDocument()
      const approveBtn = screen.getByRole('button', { name: /Approve Purchase Order/i })
      expect(approveBtn).not.toBeDisabled()
    })
  })

  test('SuppliersAdmin lists registered suppliers', async () => {
    mockListSuppliers.mockResolvedValue([
      { supplierId: 'SUP-01', name: 'Everest Outdoor', code: 'EVEREST', active: true, contactEmail: 'contact@everest.com', phone: '0123456789' },
    ])

    render(
      <QueryClientProvider client={client}>
        <SuppliersAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Suppliers')).toBeInTheDocument()
      expect(screen.getByText('Everest Outdoor')).toBeInTheDocument()
      expect(screen.getByText('EVEREST')).toBeInTheDocument()
    })
  })
})
