import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let sessionState: { data: unknown; status: string }
jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))

import { ManagementDashboard } from '../management-dashboard'
import { I18nProvider } from '@/i18n'
import { fetchManagementMetrics } from '@/metrics/metrics-api'

const sampleMetrics = {
  overview: {
    confirmationRate: 92.5,
    totalOrders: 120,
    confirmedOrders: 111,
    grossCollectedVnd: 79200000,
    totalRefundedVnd: 2700000,
    netCollectionVnd: 76500000,
    availableInventoryUnits: 1450,
    reservedInventoryUnits: 45,
    onTimeDeliveryRate: 96.5,
  },
  caseAging: {
    totalOpenCases: 3,
    openUnder2h: 2,
    open2to24h: 1,
    openOver24h: 0,
    overdueSlaCount: 1,
  },
  metadata: {
    source: 'commerce_lab PostgreSQL (Authoritative Transactional Views)',
    period: 'TODAY',
    asOf: '2026-11-17T14:00:00Z',
    policyNotice:
      'Lưu ý SC12: Dữ liệu báo cáo có độ trễ nhất quán cuối (eventual consistency) chỉ phục vụ theo dõi điều hành. Nghiêm cấm dùng số liệu báo cáo để quyết định bán vượt tồn kho hoặc tính toán hạn mức hoàn tiền.',
  },
}

// Mock metrics API
jest.mock('@/metrics/metrics-api', () => ({
  METRICS_KEY: (period: string) => ['management-metrics', period],
  fetchManagementMetrics: jest.fn(),
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ManagementDashboard (P11-T08, SC12)', () => {
  beforeEach(() => {
    sessionState = {
      data: { user: { id: 'ops-1', name: 'Ops Mgr', roles: ['OPS_MGR'] } },
      status: 'authenticated',
    }
    ;(fetchManagementMetrics as jest.Mock).mockResolvedValue(sampleMetrics)
  })

  it('denies access for customer or unauthorized role', () => {
    sessionState = {
      data: { user: { id: 'cust-1', name: 'Customer', roles: ['CUSTOMER'] } },
      status: 'authenticated',
    }
    renderWithClient(<ManagementDashboard />)
    expect(screen.getByText(/don't have permission to view management metrics/i)).toBeInTheDocument()
  })

  it('shows error banner when metrics fail to load', async () => {
    ;(fetchManagementMetrics as jest.Mock).mockRejectedValueOnce(new Error('Metrics service down'))
    renderWithClient(<ManagementDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Metrics service down')
    })
  })

  it('renders executive metrics cards with net collection and confirmation rate', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Executive Management Dashboard/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '7 Days' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '30 Days' })).toBeInTheDocument()
      expect(screen.getByText('92.5%')).toBeInTheDocument()
      expect(screen.getByText(/1[.,]450 units/i)).toBeInTheDocument()
    })
  })

  it('renders SC12 policy banner reminding that reports never drive transactional decisions', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      const banner = screen.getByTestId('sc12-policy-banner')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveTextContent('Data Source & SC12 Invariant Policy')
      expect(banner).toHaveTextContent('Nghiêm cấm dùng số liệu báo cáo để quyết định bán vượt tồn kho')
    })
  })

  it('renders operational exception case aging and 30-min SLA alert', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/3 open cases/i)).toBeInTheDocument()
      expect(screen.getByText(/past the 30-minute SLA/i)).toBeInTheDocument()
    })
  })

  it('renders Vietnamese dashboard header, period labels, and SC12 copy when locale is vi', async () => {
    renderWithClient(
      <I18nProvider initialLocale="vi">
        <ManagementDashboard />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Báo cáo Quản trị Điều hành/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hôm nay' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '7 Ngày' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '30 Ngày' })).toBeInTheDocument()
      expect(screen.getByTestId('sc12-policy-banner')).toHaveTextContent(
        'Nguồn dữ liệu & Quy tắc Bất biến SC12'
      )
      expect(screen.getByText(/3 vụ việc đang mở/i)).toBeInTheDocument()
    })
  })
})
