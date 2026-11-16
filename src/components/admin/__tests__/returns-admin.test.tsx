import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { BackofficeReturnDetail } from '@/types/returns'

let sessionState: { data: unknown; status: string }
const mockList = jest.fn()

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/returns/backoffice-returns-api', () => ({
  STAFF_RETURNS_KEY: ['staff-returns'],
  listBackofficeReturns: (...args: unknown[]) => mockList(...args),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ReturnsAdmin } from '../returns-admin'

const STAFF = {
  user: { id: 's1', name: 'Support Lead', email: 'lead@shop.vn', roles: ['SUPPORT_LEAD'], warehouseScopes: ['ALL'] },
}

const mockItem: BackofficeReturnDetail = {
  returnId: 'RMA-001',
  orderId: 'O-001',
  userId: 'user-1',
  warehouseId: 'WH-HCM-01',
  status: 'REQUESTED',
  reason: 'CHANGED_MIND',
  lines: [
    {
      skuId: 'BP-1',
      skuName: 'Backpack Explorer',
      quantity: 1,
      receivedQuantity: 0,
      passedQuantity: 0,
      failedQuantity: 0,
      allocatedUnitPaidVnd: 270000,
    },
  ],
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
  refund: null,
  rejectionNote: '',
  history: [],
}

describe('ReturnsAdmin', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    sessionState = { data: STAFF, status: 'authenticated' }
    jest.clearAllMocks()
  })

  it('renders returns table for authorized staff', async () => {
    mockList.mockResolvedValue({
      items: [mockItem],
      total: 1,
      pageCount: 1,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnsAdmin />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('RMA-001')).toBeInTheDocument()
      expect(screen.getByText('O-001')).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'WH-HCM-01' })).toBeInTheDocument()
    })
  })

  it('blocks unauthorized users without staff role', () => {
    sessionState = {
      data: { user: { roles: ['CUSTOMER'] } },
      status: 'authenticated',
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnsAdmin />
      </QueryClientProvider>
    )

    expect(screen.getByText(/You don't have permission to view and manage returns/i)).toBeInTheDocument()
  })
})
