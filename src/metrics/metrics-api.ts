import { backofficeApi } from '@/services/api/clients'

export interface ManagementMetricsData {
  overview: {
    confirmationRate: number
    totalOrders: number
    confirmedOrders: number
    grossCollectedVnd: number
    totalRefundedVnd: number
    netCollectionVnd: number
    availableInventoryUnits: number
    reservedInventoryUnits: number
    onTimeDeliveryRate: number
  }
  caseAging: {
    totalOpenCases: number
    openUnder2h: number
    open2to24h: number
    openOver24h: number
    overdueSlaCount: number
  }
  metadata: {
    source: string
    period: string
    asOf: string
    policyNotice: string
  }
}

export const METRICS_KEY = (period: string) => ['management-metrics', period] as const

const quiet = { skipUnauthorizedHandler: true } as const

export async function fetchManagementMetrics(period: string = 'TODAY'): Promise<ManagementMetricsData> {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') {
    return {
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
        totalOpenCases: 2,
        openUnder2h: 1,
        open2to24h: 1,
        openOver24h: 0,
        overdueSlaCount: 1,
      },
      metadata: {
        source: 'commerce_lab PostgreSQL (Authoritative Transactional Views)',
        period,
        asOf: new Date().toISOString(),
        policyNotice:
          'Lưu ý SC12: Dữ liệu báo cáo có độ trễ nhất quán cuối (eventual consistency) chỉ phục vụ theo dõi điều hành. Nghiêm cấm dùng số liệu báo cáo để quyết định bán vượt tồn kho hoặc tính toán hạn mức hoàn tiền.',
      },
    }
  }

  const { data } = await backofficeApi.get<ManagementMetricsData>('/backoffice/metrics', {
    ...quiet,
    params: { period },
  })
  return data!
}
