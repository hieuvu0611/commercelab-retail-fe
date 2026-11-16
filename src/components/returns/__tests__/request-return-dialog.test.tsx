import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestReturnDialog } from '../request-return-dialog'
import * as returnsApi from '@/returns/returns-api'

jest.mock('@/returns/returns-api', () => ({
  ...jest.requireActual('@/returns/returns-api'),
  requestReturn: jest.fn(),
}))

describe('RequestReturnDialog', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    jest.clearAllMocks()
  })

  const lines = [
    {
      skuId: 'BP-1',
      skuName: 'Backpack Explorer',
      maxQuantity: 2,
      allocatedUnitPaidVnd: 270000,
    },
  ]

  it('renders return options and calculates estimated refund', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <RequestReturnDialog
          orderId="O-001"
          lines={lines}
          shippingFeeVnd={30000}
          isOpen={true}
          onClose={jest.fn()}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText(/Request Return for Order O-001/i)).toBeInTheDocument()
    expect(screen.getByText('Backpack Explorer')).toBeInTheDocument()

    // Select the line item
    const checkbox = screen.getByRole('checkbox', { name: /Backpack Explorer/i })
    await user.click(checkbox)

    // Should estimate 270.000 VND
    expect(screen.getAllByText(/270\.000/)).toHaveLength(2)
  })

  it('submits return request with chosen reason and lines', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    const mockRequestReturn = jest.spyOn(returnsApi, 'requestReturn').mockResolvedValue({
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
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RequestReturnDialog
          orderId="O-001"
          lines={lines}
          shippingFeeVnd={30000}
          isOpen={true}
          onClose={onClose}
        />
      </QueryClientProvider>
    )

    // Select item
    await user.click(screen.getByRole('checkbox', { name: /Backpack Explorer/i }))

    // Submit
    await user.click(screen.getByRole('button', { name: /Submit Return Request/i }))

    await waitFor(() => {
      expect(mockRequestReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'O-001',
          reason: 'CHANGED_MIND',
          lines: [{ skuId: 'BP-1', quantity: 1 }],
        }),
        expect.any(String)
      )
      expect(onClose).toHaveBeenCalled()
    })
  })
})
