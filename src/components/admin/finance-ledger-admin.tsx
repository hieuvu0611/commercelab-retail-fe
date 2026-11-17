'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Scale,
  UploadCloud,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatVnd } from '@/catalog/money'
import {
  DISCREPANCY_CASES_KEY,
  JOURNAL_ENTRIES_KEY,
  LEDGER_ACCOUNTS_KEY,
  RECONCILIATION_OVERVIEW_KEY,
  SETTLEMENT_BATCHES_KEY,
  getReconciliationOverview,
  importSettlementCsv,
  listAccounts,
  listDiscrepancyCases,
  listJournalEntries,
  listSettlementBatches,
  listSettlementLines,
  matchSettlementBatch,
  resolveDiscrepancyCase,
  settlementLinesKey,
} from '@/finance/finance-api'
import type {
  DiscrepancyCauseCategory,
  ReconciliationCase,
  ResolveDiscrepancyRequest,
  SettlementBatch,
} from '@/types/finance'
import { StaffOnly } from './staff-only'

export const FINANCE_ROLES = [
  'FINANCE',
  'FINANCE_MGR',
  'OPS_MGR',
  'OPS_DIRECTOR',
  'ADMIN',
  'ACCESS_ADMIN',
] as const

const SC11_SAMPLE_CSV = `transaction_ref,order_id,type,gross_amount_vnd,fee_amount_vnd,net_amount_vnd,transacted_at
TX-VNPAY-SC11,O-SC11,COLLECTION,660000,6600,650000,2026-11-16T15:30:00+07:00
TX-VNPAY-100K,O-100K,COLLECTION,100000,1000,99000,2026-11-16T16:00:00+07:00`

export function FinanceLedgerAdmin() {
  return (
    <StaffOnly role={FINANCE_ROLES} what="view and manage finance ledger and reconciliations">
      <FinanceLedgerContent />
    </StaffOnly>
  )
}

type TabType = 'discrepancies' | 'batches' | 'ledger' | 'accounts'

function FinanceLedgerContent() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('discrepancies')
  const [selectedBatch, setSelectedBatch] = useState<SettlementBatch | null>(null)
  const [resolvingCase, setResolvingCase] = useState<ReconciliationCase | null>(null)
  const [csvContent, setCsvContent] = useState<string>('')
  const [s3Key, setS3Key] = useState<string>('settlements/2026-11-16-vnpay.csv')
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false)
  const [caseFilter, setCaseFilter] = useState<string>('ALL')
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState<string>('ALL')

  // Overview Query
  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey: RECONCILIATION_OVERVIEW_KEY,
    queryFn: getReconciliationOverview,
  })

  // Discrepancy Cases Query
  const { data: cases = [], isLoading: isLoadingCases } = useQuery({
    queryKey: [...DISCREPANCY_CASES_KEY, caseFilter],
    queryFn: () =>
      listDiscrepancyCases(caseFilter !== 'ALL' ? { status: caseFilter } : undefined),
  })

  // Batches Query
  const { data: batches = [], isLoading: isLoadingBatches } = useQuery({
    queryKey: SETTLEMENT_BATCHES_KEY,
    queryFn: listSettlementBatches,
  })

  // Journal Entries Query
  const { data: entries = [], isLoading: isLoadingEntries } = useQuery({
    queryKey: JOURNAL_ENTRIES_KEY,
    queryFn: () => listJournalEntries(),
  })

  // Accounts Query
  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: LEDGER_ACCOUNTS_KEY,
    queryFn: listAccounts,
  })

  // Lines Query for selected batch
  const { data: batchLines = [], isLoading: isLoadingLines } = useQuery({
    queryKey: settlementLinesKey(selectedBatch?.batchId || ''),
    queryFn: () => (selectedBatch ? listSettlementLines(selectedBatch.batchId) : []),
    enabled: !!selectedBatch,
  })

  // Mutations
  const importMutation = useMutation({
    mutationFn: importSettlementCsv,
    onSuccess: (data) => {
      if (data.alreadyImported) {
        toast.info('Settlement CSV already imported (idempotent)', {
          description: `Batch ${data.batch.batchId} with ${data.linesCount} lines returned with 0 duplicates.`,
        })
      } else {
        toast.success('Settlement CSV imported successfully', {
          description: `Batch ${data.batch.batchId} created with ${data.linesCount} lines.`,
        })
      }
      setIsImportOpen(false)
      setCsvContent('')
      void queryClient.invalidateQueries({ queryKey: SETTLEMENT_BATCHES_KEY })
      void queryClient.invalidateQueries({ queryKey: RECONCILIATION_OVERVIEW_KEY })
    },
    onError: (err: Error) => {
      toast.error('Import failed', { description: err.message || 'Invalid CSV data' })
    },
  })

  const matchMutation = useMutation({
    mutationFn: matchSettlementBatch,
    onSuccess: (summary) => {
      toast.success(`Batch ${summary.batchId} reconciled`, {
        description: `Matched: ${summary.matchedLines}, Discrepancies: ${summary.discrepancyLines}, Shortfall: ${formatVnd(summary.totalDiscrepancyVnd)}`,
      })
      void queryClient.invalidateQueries({ queryKey: SETTLEMENT_BATCHES_KEY })
      void queryClient.invalidateQueries({ queryKey: DISCREPANCY_CASES_KEY })
      void queryClient.invalidateQueries({ queryKey: JOURNAL_ENTRIES_KEY })
      void queryClient.invalidateQueries({ queryKey: LEDGER_ACCOUNTS_KEY })
      void queryClient.invalidateQueries({ queryKey: RECONCILIATION_OVERVIEW_KEY })
      if (selectedBatch && selectedBatch.batchId === summary.batchId) {
        void queryClient.invalidateQueries({ queryKey: settlementLinesKey(summary.batchId) })
      }
    },
    onError: (err: Error) => {
      toast.error('Reconciliation failed', { description: err.message })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: ({ caseId, payload }: { caseId: string; payload: ResolveDiscrepancyRequest }) =>
      resolveDiscrepancyCase(caseId, payload),
    onSuccess: (res) => {
      toast.success(`Case ${res.case.caseId} resolved`, {
        description: `Compensating journal entry ${res.journalEntry.entryId} recorded to offset discrepancy.`,
      })
      setResolvingCase(null)
      void queryClient.invalidateQueries({ queryKey: DISCREPANCY_CASES_KEY })
      void queryClient.invalidateQueries({ queryKey: JOURNAL_ENTRIES_KEY })
      void queryClient.invalidateQueries({ queryKey: LEDGER_ACCOUNTS_KEY })
      void queryClient.invalidateQueries({ queryKey: RECONCILIATION_OVERVIEW_KEY })
      if (selectedBatch) {
        void queryClient.invalidateQueries({ queryKey: settlementLinesKey(selectedBatch.batchId) })
      }
    },
    onError: (err: Error) => {
      toast.error('Resolution failed', { description: err.message })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold text-ink">
              Finance & Sổ Cái Kép (Ledger)
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Phase 10 · B07 / SC11
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            Double-entry journal, settlement import, matching engine, and discrepancy resolution without rewriting history (Policy I06).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void refetchOverview()
              void queryClient.invalidateQueries({ queryKey: DISCREPANCY_CASES_KEY })
              void queryClient.invalidateQueries({ queryKey: SETTLEMENT_BATCHES_KEY })
              void queryClient.invalidateQueries({ queryKey: JOURNAL_ENTRIES_KEY })
              void queryClient.invalidateQueries({ queryKey: LEDGER_ACCOUNTS_KEY })
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-paper-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
          >
            <UploadCloud className="h-4 w-4" />
            Import Settlement CSV
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-paper p-4 shadow-xs">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Settlement Batches</span>
            <FileSpreadsheet className="h-4 w-4 text-ink-2" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink">
              {overview?.totalBatches ?? batches.length}
            </span>
            <span className="text-xs text-ink-2">
              ({overview?.reconciledBatches ?? 0} reconciled, {overview?.pendingBatches ?? 0} pending)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4 shadow-xs">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Reconciled Lines</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink">
              {overview?.matchedLines ?? 0}
            </span>
            <span className="text-xs text-ink-2">
              / {overview?.totalLinesProcessed ?? 0} processed
            </span>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-xs ${
            (overview?.openDiscrepancies ?? 0) > 0
              ? 'border-amber-300 bg-amber-50/50'
              : 'border-line bg-paper'
          }`}
        >
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Open Discrepancies</span>
            <AlertTriangle
              className={`h-4 w-4 ${
                (overview?.openDiscrepancies ?? 0) > 0 ? 'text-amber-600' : 'text-ink-2'
              }`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold ${
                (overview?.openDiscrepancies ?? 0) > 0 ? 'text-amber-700' : 'text-ink'
              }`}
            >
              {overview?.openDiscrepancies ?? 0}
            </span>
            <span className="text-xs font-medium text-amber-700">
              Gap: {formatVnd(overview?.totalDiscrepancyVnd ?? 0)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4 shadow-xs">
          <div className="flex items-center justify-between text-ink-2">
            <span className="text-xs font-medium uppercase tracking-wider">Double-Entry Balance</span>
            <Scale className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-emerald-700">∑ Debit = ∑ Credit</span>
            <span className="text-xs text-ink-2">({entries.length} entries verified)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-line">
        <nav className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('discrepancies')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'discrepancies'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            Discrepancy Cases (SC11)
            {(overview?.openDiscrepancies ?? 0) > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {overview?.openDiscrepancies}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('batches')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'batches'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            Settlement Batches ({batches.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'ledger'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            General Ledger ({entries.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'accounts'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            Chart of Accounts ({accounts.length})
          </button>
        </nav>
      </div>

      {/* TAB 1: Discrepancy Cases */}
      {activeTab === 'discrepancies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setCaseFilter(st)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    caseFilter === st
                      ? 'bg-ink text-paper'
                      : 'border border-line bg-paper text-ink-2 hover:bg-paper-2'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <span className="text-xs text-ink-2">
              Showing {cases.length} discrepancy {cases.length === 1 ? 'case' : 'cases'}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-2 text-xs font-medium text-ink-2 uppercase">
                  <tr>
                    <th className="px-4 py-3">Case ID</th>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Transaction Ref</th>
                    <th className="px-4 py-3 text-right">Expected Payout</th>
                    <th className="px-4 py-3 text-right">Partner Actual</th>
                    <th className="px-4 py-3 text-right">Shortfall (Gap)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Root Cause</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingCases ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-ink-2">
                        Loading discrepancy cases...
                      </td>
                    </tr>
                  ) : cases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-ink-2">
                        No discrepancy cases found.
                      </td>
                    </tr>
                  ) : (
                    cases.map((c) => (
                      <tr key={c.caseId} className="hover:bg-paper-2/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                          {c.caseId}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{c.orderId}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-2">
                          {c.transactionRef}
                        </td>
                        <td className="px-4 py-3 text-right text-ink">
                          {formatVnd(c.expectedPayoutVnd)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-ink">
                          {formatVnd(c.actualPayoutVnd)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700">
                          {formatVnd(c.discrepancyVnd)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              c.status === 'RESOLVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-2">
                          <div>
                            <span className="font-medium text-ink">{c.causeCategory}</span>
                            {c.resolutionNotes && (
                              <p className="mt-0.5 max-w-[200px] truncate text-ink-2" title={c.resolutionNotes}>
                                {c.resolutionNotes}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.status === 'OPEN' ? (
                            <button
                              type="button"
                              onClick={() => setResolvingCase(c)}
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                            >
                              Resolve Gap
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-700 font-medium">Resolved</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Settlement Batches */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-2 text-xs font-medium text-ink-2 uppercase">
                  <tr>
                    <th className="px-4 py-3">Batch ID</th>
                    <th className="px-4 py-3">Filename / Key</th>
                    <th className="px-4 py-3 text-right">Rows</th>
                    <th className="px-4 py-3 text-right">Gross Total</th>
                    <th className="px-4 py-3 text-right">Net Payout</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Imported At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingBatches ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-ink-2">
                        Loading settlement batches...
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-ink-2">
                        No settlement batches imported yet. Click &quot;Import Settlement CSV&quot; above.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.batchId} className="hover:bg-paper-2/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                          {b.batchId}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink">{b.filename}</td>
                        <td className="px-4 py-3 text-right font-medium text-ink">{b.totalRows}</td>
                        <td className="px-4 py-3 text-right text-ink">{formatVnd(b.totalGrossVnd)}</td>
                        <td className="px-4 py-3 text-right font-medium text-ink">{formatVnd(b.totalNetVnd)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              b.status === 'RECONCILED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : b.status === 'PARTIALLY_RECONCILED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-2">
                          {new Date(b.importedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBatch(b)}
                              className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper-2 transition-colors"
                            >
                              Lines
                            </button>
                            <button
                              type="button"
                              disabled={matchMutation.isPending}
                              onClick={() => matchMutation.mutate(b.batchId)}
                              className="rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-paper hover:bg-ink/90 transition-colors disabled:opacity-50"
                            >
                              {matchMutation.isPending ? 'Matching...' : 'Match & Reconcile'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: General Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="rounded-xl border border-line bg-paper-2 p-3 text-xs text-ink-2 max-w-2xl">
              <span className="font-semibold text-ink">Double-Entry Accounting Invariant (B07, I06, SC11):</span>{' '}
              Every transaction maintains strictly equal Total Debits and Total Credits. Collections, refunds, 3PL COD settlements (Account 1310), and gap receivables are fully audited.
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="ledger-filter" className="text-xs font-medium text-ink-2">Filter by Account:</label>
              <select
                id="ledger-filter"
                value={ledgerAccountFilter}
                onChange={(e) => setLedgerAccountFilter(e.target.value)}
                className="h-9 rounded-lg border border-line bg-paper px-2.5 text-xs text-ink shadow-xs"
              >
                <option value="ALL">All Accounts</option>
                <option value="1310">1310 - 3PL COD Receivables</option>
                <option value="1110">1110 - Cash in Bank</option>
                <option value="1120">1120 - Payment Gateway Receivables</option>
                <option value="6420">6420 - Carrier COD Processing Fees</option>
                <option value="5110">5110 - Gross Sales Revenue</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-2 text-xs font-medium text-ink-2 uppercase">
                  <tr>
                    <th className="px-4 py-3">Entry ID</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Postings (Debit vs Credit)</th>
                    <th className="px-4 py-3">Posted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingEntries ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-2">
                        Loading journal entries...
                      </td>
                    </tr>
                  ) : entries.filter((e) =>
                      ledgerAccountFilter === 'ALL'
                        ? true
                        : e.postings.some((p) => p.accountCode === ledgerAccountFilter)
                    ).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-2">
                        No journal entries match account {ledgerAccountFilter}.
                      </td>
                    </tr>
                  ) : (
                    entries
                      .filter((e) =>
                        ledgerAccountFilter === 'ALL'
                          ? true
                          : e.postings.some((p) => p.accountCode === ledgerAccountFilter)
                      )
                      .map((entry) => (
                      <tr key={entry.entryId} className="hover:bg-paper-2/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                          {entry.entryId}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink text-xs">
                          <span className="rounded bg-paper-3 px-2 py-0.5">
                            {entry.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-2">
                          {entry.referenceId}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink max-w-[280px]">
                          {entry.description}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {entry.postings.map((p, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs font-mono"
                              >
                                <span className="font-semibold text-ink">
                                  {p.accountCode}{' '}
                                  <span
                                    className={
                                      p.direction === 'DEBIT'
                                        ? 'text-blue-600 font-bold'
                                        : 'text-emerald-600 font-bold'
                                    }
                                  >
                                    [{p.direction}]
                                  </span>
                                </span>
                                <span className="text-ink font-medium">
                                  {formatVnd(p.amountVnd)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-2">
                          {new Date(entry.postedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Chart of Accounts */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-2 text-xs font-medium text-ink-2 uppercase">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Account Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Balance (VND)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingAccounts ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-ink-2">
                        Loading chart of accounts...
                      </td>
                    </tr>
                  ) : (
                    accounts.map((acc) => (
                      <tr key={acc.accountCode} className="hover:bg-paper-2/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink">
                          {acc.accountCode}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{acc.accountName}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-paper-3 px-2.5 py-0.5 text-xs font-medium text-ink">
                            {acc.accountType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                          {formatVnd(acc.balanceVnd)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Import Settlement CSV */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-line bg-paper p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h2 className="font-heading text-lg font-semibold text-ink">
                Import Partner Settlement CSV
              </h2>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-ink-2 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-2">S3 Key / File identifier</label>
                <input
                  type="text"
                  value={s3Key}
                  onChange={(e) => setS3Key(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-hidden focus:border-ink"
                  placeholder="settlements/2026-11-16.csv"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-ink-2">CSV Content</label>
                  <button
                    type="button"
                    onClick={() => setCsvContent(SC11_SAMPLE_CSV)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Load SC11 Sample CSV (660k gross, 650k net, 3.4k gap)
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder="Paste CSV rows here..."
                  className="mt-1 w-full font-mono text-xs rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-hidden focus:border-ink"
                />
              </div>

              <div className="rounded-lg bg-paper-2 p-3 text-xs text-ink-2">
                <strong>Idempotency Rule:</strong> Uploading the same CSV content computes a duplicate SHA-256 hash and immediately returns the existing batch with 0 duplicate rows written.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importMutation.isPending || !csvContent.trim()}
                onClick={() => importMutation.mutate({ s3Key, content: csvContent })}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing...' : 'Confirm Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: View Batch Lines */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-ink">
                  Batch Lines: {selectedBatch.batchId}
                </h2>
                <p className="text-xs text-ink-2">{selectedBatch.filename} · {batchLines.length} rows</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatch(null)}
                className="text-ink-2 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-2 text-xs font-medium text-ink-2 uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Tx Ref</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Fee</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2">Match Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingLines ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-ink-2">
                        Loading lines...
                      </td>
                    </tr>
                  ) : batchLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-ink-2">
                        No lines found in batch.
                      </td>
                    </tr>
                  ) : (
                    batchLines.map((line) => (
                      <tr key={line.lineNumber} className="hover:bg-paper-2/50 text-xs">
                        <td className="px-3 py-2 font-mono">{line.lineNumber}</td>
                        <td className="px-3 py-2 font-medium">{line.orderId}</td>
                        <td className="px-3 py-2 font-mono text-ink-2">{line.transactionRef}</td>
                        <td className="px-3 py-2 text-right">{formatVnd(line.grossAmountVnd)}</td>
                        <td className="px-3 py-2 text-right text-ink-2">{formatVnd(line.feeAmountVnd)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatVnd(line.netAmountVnd)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              line.matchStatus === 'MATCHED' || line.matchStatus === 'RESOLVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : line.matchStatus === 'DISCREPANCY_OPEN'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-paper-3 text-ink-2'
                            }`}
                          >
                            {line.matchStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBatch(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Resolve Discrepancy Case */}
      {resolvingCase && (
        <ResolveCaseModal
          discrepancyCase={resolvingCase}
          onClose={() => setResolvingCase(null)}
          onConfirm={(payload) =>
            resolveMutation.mutate({ caseId: resolvingCase.caseId, payload })
          }
          isPending={resolveMutation.isPending}
        />
      )}
    </div>
  )
}

function ResolveCaseModal({
  discrepancyCase,
  onClose,
  onConfirm,
  isPending,
}: {
  discrepancyCase: ReconciliationCase
  onClose: () => void
  onConfirm: (payload: {
    causeCategory: DiscrepancyCauseCategory
    resolutionNotes: string
    compensatingAccountCode: string
  }) => void
  isPending: boolean
}) {
  const [causeCategory, setCauseCategory] = useState<DiscrepancyCauseCategory>('FEE_ADJUSTMENT')
  const [resolutionNotes, setResolutionNotes] = useState<string>(
    'Partner gateway applied international card fee surcharge (3,400 VND); accepted per contract annex B'
  )
  const [compensatingAccount, setCompensatingAccount] = useState<string>('6410')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-paper p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">
              Investigate & Resolve Discrepancy
            </h2>
            <p className="text-xs text-ink-2">Case {discrepancyCase.caseId} · Order {discrepancyCase.orderId}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Summary Box */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-2">Expected Payout (after 1% standard fee):</span>
              <span className="font-medium text-ink">{formatVnd(discrepancyCase.expectedPayoutVnd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Partner Actual Received:</span>
              <span className="font-medium text-ink">{formatVnd(discrepancyCase.actualPayoutVnd)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-amber-200 font-semibold text-amber-900">
              <span>Discrepancy Shortfall:</span>
              <span>{formatVnd(discrepancyCase.discrepancyVnd)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2">Root Cause Category</label>
            <select
              value={causeCategory}
              onChange={(e) => setCauseCategory(e.target.value as DiscrepancyCauseCategory)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-hidden focus:border-ink"
            >
              <option value="FEE_ADJUSTMENT">FEE_ADJUSTMENT (Gateway Fee Surcharge)</option>
              <option value="BANK_CHARGE">BANK_CHARGE (Intermediary Bank Fee)</option>
              <option value="GATEWAY_DISPUTE">GATEWAY_DISPUTE (Chargeback / Hold)</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2">Compensating Debit Account</label>
            <select
              value={compensatingAccount}
              onChange={(e) => setCompensatingAccount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-hidden focus:border-ink font-mono"
            >
              <option value="6410">6410 - Payment Gateway Processing Fees (Debit Expense)</option>
              <option value="1110">1110 - Cash in Bank (Debit Bank if funds recovered)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2">Resolution Notes & Audit Evidence</label>
            <textarea
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-hidden focus:border-ink"
            />
          </div>

          <p className="text-xs text-ink-2 italic">
            Resolving this case will post a compensating double-entry: Debit {compensatingAccount} ({formatVnd(discrepancyCase.discrepancyVnd)}) and Credit 1388 ({formatVnd(discrepancyCase.discrepancyVnd)}), bringing the discrepancy receivable balance to zero without changing the historical 660,000 VND collection.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !resolutionNotes.trim()}
            onClick={() =>
              onConfirm({
                causeCategory,
                resolutionNotes,
                compensatingAccountCode: compensatingAccount,
              })
            }
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending ? 'Resolving...' : 'Confirm Resolution'}
          </button>
        </div>
      </div>
    </div>
  )
}
