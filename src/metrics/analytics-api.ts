import { backofficeApi } from '@/services/api/clients'

export interface OlapKpis {
  totalOrders: number
  confirmedOrders: number
  deliveredOrders: number
  grossGmvVnd: number
  totalDiscountVnd: number
  codOrders: number
  prepaidOrders: number
  avgOrderValueVnd: number
  openExceptionCases: number
  totalRmaRequests: number
}

export interface OlapWarehouseRow {
  warehouseId: string
  shipments: number
  delivered: number
  codToCollectVnd: number
  availableUnits: number
  reservedUnits: number
}

export interface OlapStatusRow {
  status: string
  orders: number
  gmvVnd: number
}

export interface OlapDashboardResponse {
  kpis: OlapKpis
  byWarehouse: OlapWarehouseRow[]
  byStatus: OlapStatusRow[]
  metadata: {
    source: string
    database: string
    period: string
    lastSyncedAt: string | null
    lagSeconds: number | null
    isStaleWarning: boolean
    policyNotice: string
  }
}

export interface OlapSyncResult {
  syncedAt: string
  ordersSynced: number
  shipmentsSynced: number
  inventoryRowsSynced: number
  source: string
}

export const OLAP_ANALYTICS_KEY = ['admin-olap-analytics'] as const
const quiet = { skipUnauthorizedHandler: true } as const

export async function fetchOlapAnalytics(period = '30D'): Promise<OlapDashboardResponse> {
  const { data } = await backofficeApi.get<OlapDashboardResponse>('/backoffice/analytics/olap', {
    params: { period },
    ...quiet,
  })
  return data!
}

export async function syncOlapAnalytics(): Promise<OlapSyncResult> {
  const { data } = await backofficeApi.post<OlapSyncResult>('/backoffice/analytics/sync', {}, quiet)
  return data!
}
