export type CaseCategory =
  | 'PAYMENT_UNKNOWN_EXPIRED'
  | 'PICK_SHORTFALL'
  | 'TRANSFER_DISCREPANCY'
  | 'SETTLEMENT_MISMATCH'
  | 'RECEIVING_SHORTAGE'
  | 'CANCEL_ARBITRATION'

export type CaseStatus =
  | 'OPEN_UNASSIGNED'
  | 'ASSIGNED_IN_PROGRESS'
  | 'RESOLVED_WITH_EVIDENCE'

export interface TimelineEntry {
  at: string
  actor: string
  action: string
  evidenceUrl?: string
  note?: string
}

export interface ExceptionCase {
  caseId: string
  referenceId: string
  category: CaseCategory
  status: CaseStatus
  ownerId: string | null
  slaFirstAssignDueAt: string
  nextActionDeadline: string
  summary: string
  resolutionEvidence?: string
  createdAt: string
  updatedAt: string
  timeline: TimelineEntry[]
  isSlaOverdue?: boolean
}
