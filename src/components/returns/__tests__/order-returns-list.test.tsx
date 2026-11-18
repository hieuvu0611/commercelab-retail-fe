import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { OrderReturnsList } from '../order-returns-list'
import * as returnsApi from '@/returns/returns-api'
import type { ReturnCase } from '@/types/returns'

jest.mock('@/returns/returns-api', () => ({
  ...jest.requireActual('@/returns/returns-api'),
  listOrderReturns: jest.fn(),
}))

describe('OrderReturnsList', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    jest.clearAllMocks()
  })

  it('renders returns associated with an order', async () => {
    const mockReturns: ReturnCase[] = [
      {
        returnId: 'RMA-001',
        orderId: 'O-001',
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
      },
    ]

    jest.spyOn(returnsApi, 'listOrderReturns').mockResolvedValue(mockReturns)

    render(
      <QueryClientProvider client={queryClient}>
        <OrderReturnsList orderId="O-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Returns & Exchanges')).toBeInTheDocument()
      expect(screen.getByText('RMA-001')).toBeInTheDocument()
      expect(screen.getByText(/Return requested/i)).toBeInTheDocument()
    })
  })
})
