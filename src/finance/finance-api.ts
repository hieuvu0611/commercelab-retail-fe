import { storefrontApi } from '@/services/api/clients'
import type {
  BatchMatchSummary,
  JournalEntry,
  LedgerAccount,
  ReconciliationCase,
  ReconciliationOverview,
  ResolveDiscrepancyRequest,
  SettlementBatch,
  SettlementLine,
} from '@/types/finance'

const quiet = { skipUnauthorizedHandler: true } as const

// React Query keys
export const RECONCILIATION_OVERVIEW_KEY = ['reconciliation-overview'] as const
export const LEDGER_ACCOUNTS_KEY = ['ledger-accounts'] as const
export const JOURNAL_ENTRIES_KEY = ['journal-entries'] as const
export const journalEntriesKey = (referenceId?: string) => ['journal-entries', referenceId] as const
export const SETTLEMENT_BATCHES_KEY = ['settlement-batches'] as const
export const settlementLinesKey = (batchId: string) => ['settlement-lines', batchId] as const
export const DISCREPANCY_CASES_KEY = ['discrepancy-cases'] as const
export const discrepancyCasesKey = (status?: string) => ['discrepancy-cases', status] as const
export const discrepancyCaseKey = (caseId: string) => ['discrepancy-case', caseId] as const

// 1. Overview & Metrics
export async function getReconciliationOverview(): Promise<ReconciliationOverview> {
  const { data } = await storefrontApi.get<ReconciliationOverview>(
    '/admin/ledger/reconciliations/summary',
    quiet
  )
  return (
    data ?? {
      totalBatches: 0,
      reconciledBatches: 0,
      pendingBatches: 0,
      totalLinesProcessed: 0,
      matchedLines: 0,
      openDiscrepancies: 0,
      totalDiscrepancyVnd: 0,
    }
  )
}

// 2. Chart of Accounts
export async function listAccounts(): Promise<LedgerAccount[]> {
  const { data } = await storefrontApi.get<LedgerAccount[]>('/admin/ledger/accounts', quiet)
  return Array.isArray(data) ? data : []
}

// 3. Journal Entries
type JournalEntriesPayload =
  | JournalEntry[]
  | { entries?: JournalEntry[]; total?: number; limit?: number; offset?: number }

export async function listJournalEntries(referenceId?: string): Promise<JournalEntry[]> {
  const { data } = await storefrontApi.get<JournalEntriesPayload>('/admin/ledger/entries', {
    ...quiet,
    params: referenceId ? { referenceId } : undefined,
  })
  if (Array.isArray(data)) return data
  return Array.isArray(data?.entries) ? data.entries : []
}

// 4. Settlement Batches & Import
type SettlementBatchesPayload =
  | SettlementBatch[]
  | { batches?: SettlementBatch[]; total?: number; limit?: number; offset?: number }

export async function listSettlementBatches(): Promise<SettlementBatch[]> {
  const { data } = await storefrontApi.get<SettlementBatchesPayload>(
    '/admin/ledger/settlements/batches',
    quiet
  )
  if (Array.isArray(data)) return data
  return Array.isArray(data?.batches) ? data.batches : []
}

export async function listSettlementLines(batchId: string): Promise<SettlementLine[]> {
  const { data } = await storefrontApi.get<SettlementLine[]>(
    `/admin/ledger/settlements/batches/${encodeURIComponent(batchId)}/lines`,
    quiet
  )
  return data ?? []
}

export async function importSettlementCsv(payload: {
  s3Key?: string
  content: string
}): Promise<{ batch: SettlementBatch; alreadyImported: boolean; linesCount: number }> {
  const { data } = await storefrontApi.post<{
    batch: SettlementBatch
    alreadyImported: boolean
    linesCount: number
  }>('/admin/ledger/settlements/import', payload, quiet)
  return data!
}

export async function matchSettlementBatch(batchId: string): Promise<BatchMatchSummary> {
  const { data } = await storefrontApi.post<BatchMatchSummary>(
    `/admin/ledger/settlements/batches/${encodeURIComponent(batchId)}/match`,
    {},
    quiet
  )
  return data!
}

// 5. Discrepancy Cases
export async function listDiscrepancyCases(params?: {
  status?: string
  batchId?: string
}): Promise<ReconciliationCase[]> {
  const { data } = await storefrontApi.get<ReconciliationCase[]>('/admin/ledger/discrepancies', {
    ...quiet,
    params,
  })
  return data ?? []
}

export async function getDiscrepancyCase(caseId: string): Promise<ReconciliationCase> {
  const { data } = await storefrontApi.get<ReconciliationCase>(
    `/admin/ledger/discrepancies/${encodeURIComponent(caseId)}`,
    quiet
  )
  return data!
}

export async function resolveDiscrepancyCase(
  caseId: string,
  payload: ResolveDiscrepancyRequest
): Promise<{ case: ReconciliationCase; journalEntry: JournalEntry }> {
  const { data } = await storefrontApi.post<{
    case: ReconciliationCase
    journalEntry: JournalEntry
  }>(`/admin/ledger/discrepancies/${encodeURIComponent(caseId)}/resolve`, payload, quiet)
  return data!
}
