import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApprovalsAdmin } from '../approvals-admin'
import { ExceptionCasesAdmin } from '../exception-cases-admin'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'staff-user', id: 'staff-user', roles: ['ADMIN'] } },
    status: 'authenticated',
  }),
}))

// Mock backoffice returns api for approvals
jest.mock('@/returns/backoffice-returns-api', () => ({
  STAFF_APPROVALS_KEY: ['staff-approvals'],
  listApprovals: jest.fn().mockResolvedValue([
    {
      id: 'APP-001',
      requestType: 'EXCEPTION_REFUND',
      referenceId: 'RMA-001',
      amountVnd: 600000,
      quantityDiff: 0,
      makerUserId: 'staff-user', // Same as current user -> Self approval forbidden
      status: 'PENDING',
      reason: 'Refund exceeds 500k limit',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'APP-002',
      requestType: 'STOCK_ADJUSTMENT',
      referenceId: 'ST-002',
      amountVnd: 500000,
      quantityDiff: -2,
      makerUserId: 'warehouse-staff', // Different user -> Can approve
      status: 'PENDING',
      reason: 'Shortage on counting',
      createdAt: new Date().toISOString(),
    },
  ]),
  decideApproval: jest.fn().mockResolvedValue({
    id: 'APP-002',
    status: 'APPROVED',
  }),
}))

// Mock cases api
jest.mock('@/cases/cases-api', () => ({
  CASES_KEY: ['exception-cases'],
  listExceptionCases: jest.fn().mockResolvedValue([
    {
      caseId: 'CASE-001',
      referenceId: 'PO-001',
      category: 'RECEIVING_SHORTAGE',
      status: 'OPEN_UNASSIGNED',
      ownerId: null,
      slaFirstAssignDueAt: new Date(Date.now() - 3600 * 1000).toISOString(), // Overdue
      nextActionDeadline: new Date(Date.now() + 3600 * 1000).toISOString(),
      summary: 'Damaged carton during delivery',
      createdAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          at: new Date().toISOString(),
          actor: 'qc-inspector',
          action: 'Created case',
        },
      ],
    },
  ]),
  assignExceptionCase: jest.fn().mockResolvedValue({
    caseId: 'CASE-001',
    status: 'ASSIGNED_IN_PROGRESS',
    ownerId: 'finance-an',
  }),
  resolveExceptionCase: jest.fn().mockResolvedValue({
    caseId: 'CASE-001',
    status: 'RESOLVED_WITH_EVIDENCE',
  }),
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ApprovalsAdmin & ExceptionCasesAdmin (P11-T07)', () => {
  describe('ApprovalsAdmin (Maker != Checker)', () => {
    it('disables approval button and shows warning for self-proposed approval', async () => {
      renderWithClient(<ApprovalsAdmin />)

      await waitFor(() => {
        expect(screen.getByText('APP-001')).toBeInTheDocument()
      })

      // Self-approval warning must be present
      expect(screen.getByTestId('self-approval-warning')).toBeInTheDocument()

      // The Approve button for APP-001 must be disabled
      const approveButtons = screen.getAllByRole('button', { name: /Phê duyệt/i })
      expect(approveButtons[0]).toBeDisabled()
    })

    it('enables approval button for requests proposed by another maker', async () => {
      renderWithClient(<ApprovalsAdmin />)

      await waitFor(() => {
        expect(screen.getByText('APP-002')).toBeInTheDocument()
      })

      const approveButtons = screen.getAllByRole('button', { name: /Phê duyệt/i })
      // APP-002 is the second card
      expect(approveButtons[1]).not.toBeDisabled()
    })
  })

  describe('ExceptionCasesAdmin (Section 17)', () => {
    it('displays exception case with overdue 30-min SLA badge', async () => {
      renderWithClient(<ExceptionCasesAdmin />)

      await waitFor(() => {
        expect(screen.getByText('CASE-001')).toBeInTheDocument()
        expect(screen.getByText(/QUÁ HẠN PHÂN CÔNG 30 PHÚT/i)).toBeInTheDocument()
      })
    })

    it('opens assign modal when clicking assign button', async () => {
      renderWithClient(<ExceptionCasesAdmin />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Phân công người phụ trách/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Phân công người phụ trách/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Phân công Phụ trách Vụ việc/i })).toBeInTheDocument()
      })
    })
  })
})
