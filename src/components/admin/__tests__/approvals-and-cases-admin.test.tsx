import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApprovalsAdmin } from '../approvals-admin'
import { ExceptionCasesAdmin } from '../exception-cases-admin'

let sessionState = {
  data: { user: { name: 'staff-user', id: 'staff-user', roles: ['ADMIN'] } },
  status: 'authenticated',
}

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => sessionState,
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

import { assignExceptionCase } from '@/cases/cases-api'

describe('ApprovalsAdmin & ExceptionCasesAdmin (P11-T07)', () => {
  beforeEach(() => {
    sessionState = {
      data: { user: { name: 'staff-user', id: 'staff-user', roles: ['ADMIN'] } },
      status: 'authenticated',
    }
  })

  describe('ApprovalsAdmin (Maker != Checker)', () => {
    it('denies access for customer role without staff permission', () => {
      sessionState = {
        data: { user: { name: 'cust', id: 'cust-1', roles: ['CUSTOMER'] } },
        status: 'authenticated',
      }
      renderWithClient(<ApprovalsAdmin />)
      expect(screen.getByText(/don't have permission to review and manage approval requests/i)).toBeInTheDocument()
    })

    it('compares maker by strict user id even when display name matches', async () => {
      sessionState = {
        data: { user: { name: 'staff-user', id: 'other-checker-id', roles: ['ADMIN'] } },
        status: 'authenticated',
      }
      renderWithClient(<ApprovalsAdmin />)
      await waitFor(() => {
        expect(screen.getByText('APP-001')).toBeInTheDocument()
      })
      const approveButtons = screen.getAllByRole('button', { name: /Phê duyệt/i })
      expect(approveButtons[0]).not.toBeDisabled()
    })
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

    it('opens assign modal with free-text owner input and displays assignment failure alert', async () => {
      ;(assignExceptionCase as jest.Mock).mockRejectedValueOnce(new Error('Assign permission denied'))
      renderWithClient(<ExceptionCasesAdmin />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Phân công người phụ trách/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Phân công người phụ trách/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Phân công Phụ trách Vụ việc/i })).toBeInTheDocument()
      })

      const ownerInput = screen.getByLabelText(/Mã nhân sự phụ trách/i) as HTMLInputElement
      expect(ownerInput.value).toBe('staff-user')
      fireEvent.change(ownerInput, { target: { value: 'ops-checker-9' } })
      fireEvent.click(screen.getByRole('button', { name: /Xác nhận phân công/i }))

      await waitFor(() => {
        expect(assignExceptionCase).toHaveBeenCalledWith('CASE-001', 'ops-checker-9')
        expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Assign permission denied')
      })
    })
  })
})
