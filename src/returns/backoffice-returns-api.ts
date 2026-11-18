import { backofficeApi } from '@/services/api/clients'
import type { ApprovalRecord, BackofficeReturnDetail } from '@/types/returns'
import { toApprovalRecord, toBackofficeReturnDetail } from './adapters'

export const STAFF_RETURNS_KEY = ['staff-returns'] as const
export const staffReturnKey = (rmaId: string) => ['staff-return', rmaId] as const
export const STAFF_APPROVALS_KEY = ['staff-approvals'] as const

const quiet = { skipUnauthorizedHandler: true } as const

export interface BackofficeReturnsQuery {
  status?: string
  warehouseId?: string
  orderId?: string
  page?: number
  limit?: number
}

export async function listBackofficeReturns(query?: BackofficeReturnsQuery) {
  const { data, metadata } = await backofficeApi.get<unknown[]>('/backoffice/returns', {
    ...quiet,
    params: query,
  })
  return {
    items: (data ?? []).map(toBackofficeReturnDetail),
    total: metadata?.total ?? data?.length ?? 0,
    pageCount: metadata?.pageCount ?? 1,
  }
}

export async function getBackofficeReturn(rmaId: string): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.get<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}`,
    quiet
  )
  return toBackofficeReturnDetail(data)
}

export async function receiveBackofficeReturn(rmaId: string): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/receive`,
    {},
    quiet
  )
  return toBackofficeReturnDetail(data)
}

export interface QcInspectionResult {
  skuId: string
  passedQuantity: number
  failedQuantity: number
}

export async function submitQcBackofficeReturn(
  rmaId: string,
  results: QcInspectionResult[]
): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/qc`,
    { results },
    quiet
  )
  return toBackofficeReturnDetail(data)
}

export async function disburseRefund(rmaId: string): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/refund`,
    {},
    quiet
  )
  return toBackofficeReturnDetail(data)
}

export async function requestRefundApproval(
  rmaId: string,
  reason?: string
): Promise<ApprovalRecord> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/request-approval`,
    { reason },
    quiet
  )
  return toApprovalRecord(data)
}

export async function listApprovals(params?: { status?: string; requestType?: string }) {
  const { data } = await backofficeApi.get<unknown[]>('/backoffice/approvals', {
    ...quiet,
    params,
  })
  return (data ?? []).map(toApprovalRecord)
}

export async function decideApproval(
  id: string,
  action: 'APPROVE' | 'REJECT',
  note?: string
): Promise<ApprovalRecord> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/approvals/${encodeURIComponent(id)}/decide`,
    { action, note },
    quiet
  )
  return toApprovalRecord(data)
}

export async function rejectBackofficeReturn(
  rmaId: string,
  note: string
): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/reject`,
    { note },
    quiet
  )
  return toBackofficeReturnDetail(data)
}

export async function createExchangeOrder(
  rmaId: string,
  replacementSkuId?: string
): Promise<BackofficeReturnDetail> {
  const { data } = await backofficeApi.post<unknown>(
    `/backoffice/returns/${encodeURIComponent(rmaId)}/exchange`,
    { replacementSkuId },
    quiet
  )
  return toBackofficeReturnDetail(data)
}
