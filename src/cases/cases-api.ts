import { backofficeApi } from '@/services/api/clients'
import type { ExceptionCase } from './types'

export const CASES_KEY = ['exception-cases'] as const
export const caseDetailKey = (id: string) => ['exception-case', id] as const

const quiet = { skipUnauthorizedHandler: true } as const

const mockCases: Map<string, ExceptionCase> = new Map()

function getMockCases(): Map<string, ExceptionCase> {
  if (mockCases.size === 0) {
    const now = Date.now()
    const sc11: ExceptionCase = {
      caseId: 'CASE-SC11-001',
      referenceId: 'O-001',
      category: 'SETTLEMENT_MISMATCH',
      status: 'ASSIGNED_IN_PROGRESS',
      ownerId: 'finance-an',
      slaFirstAssignDueAt: new Date(now - 10 * 60 * 1000).toISOString(),
      nextActionDeadline: new Date(now + 90 * 60 * 1000).toISOString(),
      summary: 'Đối soát kỳ T+1 đơn O-001: Kỳ vọng 653.400đ, thực nhận 650.000đ -> Lệch thiếu 3.400đ (SC11)',
      createdAt: new Date(now - 40 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      timeline: [
        {
          at: new Date(now - 40 * 60 * 1000).toISOString(),
          actor: 'LEDGER_RECONCILIATION_ENGINE',
          action: 'Tự động mở vụ việc lệch đối soát 3.400đ (I06)',
          evidenceUrl: 'https://commerce-lab-retail-assets.s3.ap-southeast-1.amazonaws.com/settlements/2026-10-26.csv',
        },
      ],
    }
    const sc09: ExceptionCase = {
      caseId: 'CASE-SC09-001',
      referenceId: 'PO-202611-001',
      category: 'RECEIVING_SHORTAGE',
      status: 'OPEN_UNASSIGNED',
      ownerId: null,
      slaFirstAssignDueAt: new Date(now + 20 * 60 * 1000).toISOString(),
      nextActionDeadline: new Date(now + 60 * 60 * 1000).toISOString(),
      summary: 'Kiểm hàng PO-202611-001 phát hiện thiếu 2 Balo City và 1 chiếc rách seal (SC09)',
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      timeline: [
        {
          at: new Date(now - 10 * 60 * 1000).toISOString(),
          actor: 'warehouse-qc',
          action: 'Lập biên bản nhận hàng thiếu và mở exception case',
          evidenceUrl: 'https://commerce-lab-retail-assets.s3.ap-southeast-1.amazonaws.com/receiving/po-001-damage.jpg',
        },
      ],
    }
    mockCases.set(sc11.caseId, sc11)
    mockCases.set(sc09.caseId, sc09)
  }
  return mockCases
}

export async function listExceptionCases(filters?: {
  status?: string
  category?: string
  ownerId?: string
}): Promise<ExceptionCase[]> {
  try {
    const { data } = await backofficeApi.get<ExceptionCase[]>('/admin/exception-cases', {
      ...quiet,
      params: filters,
    })
    if (Array.isArray(data)) return data
  } catch {
    // Fallback to mock data
  }

  const cases = Array.from(getMockCases().values())
  let result = [...cases]
  if (filters?.status) result = result.filter((c) => c.status === filters.status)
  if (filters?.category) result = result.filter((c) => c.category === filters.category)
  if (filters?.ownerId) result = result.filter((c) => c.ownerId === filters.ownerId)
  return result
}

export async function getExceptionCase(caseId: string): Promise<ExceptionCase> {
  try {
    const { data } = await backofficeApi.get<ExceptionCase>(
      `/admin/exception-cases/${encodeURIComponent(caseId)}`,
      quiet
    )
    if (data) return data
  } catch {
    // Fallback
  }

  const item = getMockCases().get(caseId)
  if (!item) throw new Error(`Case ${caseId} not found`)
  return item
}

export async function assignExceptionCase(caseId: string, ownerId: string): Promise<ExceptionCase> {
  try {
    const { data } = await backofficeApi.post<ExceptionCase>(
      `/admin/exception-cases/${encodeURIComponent(caseId)}/assign`,
      { ownerId },
      quiet
    )
    if (data) return data
  } catch {
    // Fallback
  }

  const item = getMockCases().get(caseId)
  if (!item) throw new Error(`Case ${caseId} not found`)
  item.ownerId = ownerId
  item.status = 'ASSIGNED_IN_PROGRESS'
  item.timeline.push({
    at: new Date().toISOString(),
    actor: 'staff-lead',
    action: `Phân công vụ việc cho ${ownerId}`,
  })
  return item
}

export async function resolveExceptionCase(
  caseId: string,
  evidence: string,
  note?: string
): Promise<ExceptionCase> {
  try {
    const { data } = await backofficeApi.post<ExceptionCase>(
      `/admin/exception-cases/${encodeURIComponent(caseId)}/resolve`,
      { evidence, note },
      quiet
    )
    if (data) return data
  } catch {
    // Fallback
  }

  const item = getMockCases().get(caseId)
  if (!item) throw new Error(`Case ${caseId} not found`)
  item.status = 'RESOLVED_WITH_EVIDENCE'
  item.resolutionEvidence = evidence || note
  item.timeline.push({
    at: new Date().toISOString(),
    actor: 'staff-lead',
    action: `Đóng vụ việc với bằng chứng: ${note || evidence}`,
    evidenceUrl: evidence,
    note,
  })
  return item
}
