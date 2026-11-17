export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export interface LedgerAccount {
  accountCode: string
  accountName: string
  accountType: AccountType
  balanceVnd: number
  createdAt?: string
}

export type PostingDirection = 'DEBIT' | 'CREDIT'

export interface LedgerPosting {
  postingId?: number
  entryId?: string
  accountCode: string
  direction: PostingDirection
  amountVnd: number
}

export interface JournalEntry {
  entryId: string
  eventType: string
  referenceId: string
  description: string
  postedAt: string
  createdBy: string
  createdAt?: string
  postings: LedgerPosting[]
}

export type SettlementBatchStatus = 'IMPORTED' | 'RECONCILED' | 'PARTIALLY_RECONCILED'

export interface SettlementBatch {
  batchId: string
  filename: string
  s3Key: string
  fileHash: string
  totalRows: number
  totalGrossVnd: number
  totalFeeVnd: number
  totalNetVnd: number
  status: SettlementBatchStatus
  importedBy: string
  importedAt: string
}

export type LineMatchStatus = 'PENDING' | 'MATCHED' | 'DISCREPANCY_OPEN' | 'RESOLVED'

export interface SettlementLine {
  lineId?: number
  batchId: string
  lineNumber: number
  transactionRef: string
  orderId: string
  type: 'COLLECTION' | 'REFUND' | 'FEE' | 'PAYOUT'
  grossAmountVnd: number
  feeAmountVnd: number
  netAmountVnd: number
  transactedAt: string
  matchStatus: LineMatchStatus
}

export type DiscrepancyCaseStatus = 'OPEN' | 'RESOLVED' | 'ESCALATED' | 'CLOSED'

export type DiscrepancyCauseCategory =
  | 'UNCLASSIFIED'
  | 'FEE_ADJUSTMENT'
  | 'BANK_CHARGE'
  | 'GATEWAY_DISPUTE'
  | 'OTHER'

export interface ReconciliationCase {
  caseId: string
  batchId: string
  lineNumber: number
  orderId: string
  transactionRef: string
  expectedPayoutVnd: number
  actualPayoutVnd: number
  discrepancyVnd: number
  causeCategory: DiscrepancyCauseCategory
  status: DiscrepancyCaseStatus
  assignedTo: string
  resolvedBy: string
  resolutionNotes: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ReconciliationOverview {
  totalBatches: number
  reconciledBatches: number
  pendingBatches: number
  totalLinesProcessed: number
  matchedLines: number
  openDiscrepancies: number
  totalDiscrepancyVnd: number
}

export interface BatchMatchSummary {
  batchId: string
  totalLines: number
  matchedLines: number
  discrepancyLines: number
  totalGrossVnd: number
  totalFeeVnd: number
  totalNetVnd: number
  totalDiscrepancyVnd: number
  journalEntriesCreated: number
  batchStatus: string
  results: {
    lineNumber: number
    transactionRef: string
    orderId: string
    grossAmountVnd: number
    calculatedFeeVnd: number
    expectedPayoutVnd: number
    actualPayoutVnd: number
    discrepancyVnd: number
    status: string
    message: string
  }[]
}

export interface ResolveDiscrepancyRequest {
  causeCategory: DiscrepancyCauseCategory
  resolutionNotes: string
  compensatingAccountCode?: string
}
