import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManagementDashboard } from '../management-dashboard'

// Mock metrics API
jest.mock('@/metrics/metrics-api', () => ({
  METRICS_KEY: (period: string) => ['management-metrics', period],
  fetchManagementMetrics: jest.fn().mockResolvedValue({
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
  }),
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ManagementDashboard (P11-T08, SC12)', () => {
  it('renders executive metrics cards with net collection and confirmation rate', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Báo cáo Quản trị Điều hành/i })
      ).toBeInTheDocument()
      expect(screen.getByText('92.5%')).toBeInTheDocument()
      expect(screen.getByText(/1.450 sp/i)).toBeInTheDocument()
    })
  })

  it('renders SC12 policy banner reminding that reports never drive transactional decisions', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      const banner = screen.getByTestId('sc12-policy-banner')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveTextContent('Nguồn dữ liệu & Quy tắc Bất biến SC12')
      expect(banner).toHaveTextContent('Nghiêm cấm dùng số liệu báo cáo để quyết định bán vượt tồn kho')
    })
  })

  it('renders operational exception case aging and 30-min SLA alert', async () => {
    renderWithClient(<ManagementDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/3 vụ việc đang mở/i)).toBeInTheDocument()
      expect(screen.getByText(/quá hạn SLA 30 phút/i)).toBeInTheDocument()
    })
  })
})
