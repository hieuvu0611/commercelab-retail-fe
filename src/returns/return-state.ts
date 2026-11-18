import { ApiError } from '@/services/api/api-error'
import {
  RETURN_REASONS,
  type ReturnReasonCode,
  type ReturnStatus,
} from '@/types/returns'

const STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Return requested',
  APPROVED: 'Approved, awaiting parcel',
  RECEIVED: 'Parcel received at warehouse',
  QC_PASSED: 'Inspection passed',
  QC_FAILED: 'Inspection failed',
  REFUND_PENDING: 'Refund pending approval',
  REFUNDED: 'Refunded',
  REJECTED: 'Return rejected',
}

export const returnStatusLabel = (status: ReturnStatus): string =>
  STATUS_LABELS[status] ?? status

export const returnReasonLabel = (reason: ReturnReasonCode): string =>
  RETURN_REASONS.find((r) => r.code === reason)?.label ?? reason

const PROBLEMS: Record<string, string> = {
  ORDER_NOT_DELIVERED: 'Only a delivered order can be returned.',
  RETURN_WINDOW_CLOSED: 'The 7-day return window for this order has closed.',
  RETURN_QUANTITY_EXCEEDED: 'The requested quantity exceeds the returnable units.',
  SKU_NOT_IN_ORDER: 'Selected item is not part of this order.',
  REFUND_CEILING_EXCEEDED: 'The requested refund exceeds the remaining refund ceiling.',
  FORBIDDEN_WAREHOUSE_SCOPE: 'This return belongs to a warehouse outside your access.',
  MAKER_CHECKER_SELF_APPROVAL: 'You cannot approve your own refund request.',
  INVALID_STATE: 'This return cannot be updated in its current state.',
}

export function returnProblem(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  return PROBLEMS[code] ?? (error instanceof Error ? error.message : 'An error occurred while processing the return.')
}
