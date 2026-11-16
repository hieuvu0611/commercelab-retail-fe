import {
  RETURN_REASONS,
  RETURN_STATUSES,
  type ApprovalRecord,
  type BackofficeReturnDetail,
  type ReturnCase,
  type ReturnLine,
  type ReturnRefund,
  type ReturnReasonCode,
  type ReturnStatus,
} from '@/types/returns'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

/** An unrecognised status is read as REQUESTED: the earliest state, so no action is offered that the case may not allow. */
const returnStatus = (value: unknown): ReturnStatus =>
  RETURN_STATUSES.find((status) => status === value) ?? 'REQUESTED'

/** An unrecognised reason is read as a change of mind: the reading that never promises a shipping refund. */
const returnReason = (value: unknown): ReturnReasonCode =>
  RETURN_REASONS.find((reason) => reason.code === value)?.code ?? 'CHANGED_MIND'

export function toReturnLine(raw: unknown): ReturnLine {
  const line = asRaw(raw)
  return {
    skuId: text(line.skuId),
    skuName: text(line.skuName) || text(line.skuId),
    quantity: whole(line.quantity),
    receivedQuantity: whole(line.receivedQuantity),
    passedQuantity: whole(line.qcPassedQuantity),
    failedQuantity: whole(line.qcFailedQuantity),
    allocatedUnitPaidVnd: whole(line.allocatedUnitPaidVnd),
  }
}

/** A refund is only present once one was proposed; anything but a completed status is read as still pending. */
export function toReturnRefund(raw: unknown): ReturnRefund | null {
  if (raw === null || typeof raw !== 'object') return null
  const refund = asRaw(raw)
  const amountVnd = whole(refund.amountVnd)
  if (amountVnd <= 0) return null
  const done = refund.status === 'COMPLETED' || refund.status === 'REFUNDED'
  return {
    amountVnd,
    goodsVnd: whole(refund.goodsVnd),
    shippingVnd: whole(refund.shippingVnd),
    status: done ? 'COMPLETED' : 'PENDING',
  }
}

export function toReturnCase(raw: unknown): ReturnCase {
  const item = asRaw(raw)
  return {
    returnId: text(item.returnId),
    orderId: text(item.orderId),
    status: returnStatus(item.status),
    reason: returnReason(item.reason),
    lines: (Array.isArray(item.items) ? item.items : []).map(toReturnLine),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt) || text(item.createdAt),
    refund: toReturnRefund(item.refund),
    rejectionNote: text(item.rejectionNote),
  }
}

export function toBackofficeReturnDetail(raw: unknown): BackofficeReturnDetail {
  const item = asRaw(raw)
  const base = toReturnCase(raw)
  return {
    ...base,
    userId: text(item.userId),
    warehouseId: text(item.warehouseId),
    history: Array.isArray(item.history)
      ? item.history.map((h: unknown) => {
          const entry = asRaw(h)
          return {
            at: text(entry.at),
            type: text(entry.type),
            actor: text(entry.actor),
          }
        })
      : [],
    ...(item.linkedOrderId ? { linkedOrderId: text(item.linkedOrderId) } : {}),
  }
}

export function toApprovalRecord(raw: unknown): ApprovalRecord {
  const item = asRaw(raw)
  return {
    id: text(item.id),
    rmaId: text(item.rmaId),
    makerUserId: text(item.makerUserId),
    requestType: text(item.requestType),
    amountVnd: whole(item.amountVnd),
    status: item.status === 'APPROVED' ? 'APPROVED' : item.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
    reason: text(item.reason),
    checkerUserId: item.checkerUserId ? text(item.checkerUserId) : undefined,
    checkerRole: item.checkerRole ? text(item.checkerRole) : undefined,
    decisionNote: item.decisionNote ? text(item.decisionNote) : undefined,
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt) || text(item.createdAt),
  }
}
