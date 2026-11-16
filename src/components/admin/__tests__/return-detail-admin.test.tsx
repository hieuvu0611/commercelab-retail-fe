import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BackofficeReturnDetail } from '@/types/returns'

let sessionState: { data: unknown; status: string }
const api = {
  getBackofficeReturn: jest.fn(),
  receiveBackofficeReturn: jest.fn(),
  submitQcBackofficeReturn: jest.fn(),
  disburseRefund: jest.fn(),
  listApprovals: jest.fn(),
  requestRefundApproval: jest.fn(),
  decideApproval: jest.fn(),
  rejectBackofficeReturn: jest.fn(),
  createExchangeOrder: jest.fn(),
}

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/returns/backoffice-returns-api', () => ({
  staffReturnKey: (id: string) => ['staff-return', id],
  STAFF_RETURNS_KEY: ['staff-returns'],
  STAFF_APPROVALS_KEY: ['staff-approvals'],
  getBackofficeReturn: (...args: unknown[]) => api.getBackofficeReturn(...args),
  receiveBackofficeReturn: (...args: unknown[]) => api.receiveBackofficeReturn(...args),
  submitQcBackofficeReturn: (...args: unknown[]) => api.submitQcBackofficeReturn(...args),
  disburseRefund: (...args: unknown[]) => api.disburseRefund(...args),
  listApprovals: (...args: unknown[]) => api.listApprovals(...args),
  requestRefundApproval: (...args: unknown[]) => api.requestRefundApproval(...args),
  decideApproval: (...args: unknown[]) => api.decideApproval(...args),
  rejectBackofficeReturn: (...args: unknown[]) => api.rejectBackofficeReturn(...args),
  createExchangeOrder: (...args: unknown[]) => api.createExchangeOrder(...args),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ReturnDetailAdmin } from '../return-detail-admin'

const STAFF = {
  user: { id: 's1', name: 'Support Lead', email: 'lead@shop.vn', roles: ['SUPPORT_LEAD'], warehouseScopes: ['ALL'] },
}

const mockDetail: BackofficeReturnDetail = {
  returnId: 'RMA-001',
  orderId: 'O-001',
  userId: 'user-1',
  warehouseId: 'WH-HCM-01',
  status: 'REQUESTED',
  reason: 'DEFECTIVE',
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
  history: [{ at: '2026-11-16T10:00:00.000Z', type: 'REQUESTED', actor: 'customer' }],
}

describe('ReturnDetailAdmin', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    sessionState = { data: STAFF, status: 'authenticated' }
    api.listApprovals.mockResolvedValue([])
    jest.clearAllMocks()
  })

  it('renders RMA details and allows receiving parcel', async () => {
    const user = userEvent.setup()
    api.getBackofficeReturn.mockResolvedValue(mockDetail)
    api.receiveBackofficeReturn.mockResolvedValue({
      ...mockDetail,
      status: 'RECEIVED',
      lines: [{ ...mockDetail.lines[0], receivedQuantity: 1 }],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnDetailAdmin rmaId="RMA-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('RMA RMA-001')).toBeInTheDocument()
      expect(screen.getByText('Backpack Explorer')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Scan & Receive Parcel/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Scan & Receive Parcel/i }))

    await waitFor(() => {
      expect(api.receiveBackofficeReturn).toHaveBeenCalledWith('RMA-001')
    })
  })

  it('allows submitting QC inspection when status is RECEIVED', async () => {
    const user = userEvent.setup()
    api.getBackofficeReturn.mockResolvedValue({
      ...mockDetail,
      status: 'RECEIVED',
      lines: [{ ...mockDetail.lines[0], receivedQuantity: 1 }],
    })
    api.submitQcBackofficeReturn.mockResolvedValue({
      ...mockDetail,
      status: 'QC_PASSED',
      lines: [{ ...mockDetail.lines[0], receivedQuantity: 1, passedQuantity: 1 }],
      refund: { amountVnd: 300000, goodsVnd: 270000, shippingVnd: 30000, status: 'PENDING' },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnDetailAdmin rmaId="RMA-001" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Record QC Inspection Results/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Submit QC Inspection/i }))

    await waitFor(() => {
      expect(api.submitQcBackofficeReturn).toHaveBeenCalledWith('RMA-001', [
        { skuId: 'BP-1', passedQuantity: 1, failedQuantity: 0 },
      ])
    })
  })
})
