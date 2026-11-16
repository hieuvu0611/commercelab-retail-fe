import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { ReturnDetailView } from '../return-detail-view'
import * as returnsApi from '@/returns/returns-api'
import type { ReturnCase } from '@/types/returns'

jest.mock('@/returns/returns-api', () => ({
  ...jest.requireActual('@/returns/returns-api'),
  getReturn: jest.fn(),
}))

describe('ReturnDetailView', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    jest.clearAllMocks()
  })

  const mockRma: ReturnCase = {
    returnId: 'RMA-001',
    orderId: 'O-001',
    status: 'QC_PASSED',
    reason: 'CHANGED_MIND',
    lines: [
      {
        skuId: 'BP-1',
        skuName: 'Backpack Explorer',
        quantity: 1,
        receivedQuantity: 1,
        passedQuantity: 1,
        failedQuantity: 0,
        allocatedUnitPaidVnd: 270000,
      },
    ],
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T11:00:00.000Z',
    refund: {
      amountVnd: 270000,
      goodsVnd: 270000,
      shippingVnd: 0,
      status: 'PENDING',
    },
    rejectionNote: '',
  }

  it('renders return details, items table, and refund summary', async () => {
    jest.spyOn(returnsApi, 'getReturn').mockResolvedValue(mockRma)

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnDetailView returnId="RMA-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Return RMA-001/i)).toBeInTheDocument()
      expect(screen.getByText('Backpack Explorer')).toBeInTheDocument()
      expect(screen.getByText(/Inspection passed/i)).toBeInTheDocument()
      expect(screen.getByText(/Refund Summary/i)).toBeInTheDocument()
    })
  })
})
