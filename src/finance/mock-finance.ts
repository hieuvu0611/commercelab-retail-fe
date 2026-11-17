import type { MockRequest, MockResponse } from '@/auth/mock-api'
import type {
  BatchMatchSummary,
  DiscrepancyCauseCategory,
  JournalEntry,
  LedgerAccount,
  ReconciliationCase,
  ReconciliationOverview,
  SettlementBatch,
  SettlementLine,
} from '@/types/finance'

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data, status },
})

const failure = (status: number, code: string, message: string): MockResponse => ({
  status,
  body: { message, code, status },
})

export interface MockFinanceState {
  accounts: Map<string, LedgerAccount>
  entries: JournalEntry[]
  batches: Map<string, SettlementBatch>
  lines: Map<string, SettlementLine[]>
  cases: Map<string, ReconciliationCase>
}

let globalFinanceState: MockFinanceState | null = null

export function getMockFinanceState(): MockFinanceState {
  if (!globalFinanceState) {
    globalFinanceState = createInitialFinanceState()
  }
  return globalFinanceState
}

export function resetMockFinanceState(): void {
  globalFinanceState = createInitialFinanceState()
}

function createInitialFinanceState(): MockFinanceState {
  const accounts = new Map<string, LedgerAccount>([
    [
      '1110',
      {
        accountCode: '1110',
        accountName: 'Cash in Bank (Settlement Account)',
        accountType: 'ASSET',
        balanceVnd: 0,
      },
    ],
    [
      '1120',
      {
        accountCode: '1120',
        accountName: 'Payment Gateway Receivable (VNPay / Stripe)',
        accountType: 'ASSET',
        balanceVnd: 660000,
      },
    ],
    [
      '1310',
      {
        accountCode: '1310',
        accountName: '3PL COD Receivables',
        accountType: 'ASSET',
        balanceVnd: 500000,
      },
    ],
    [
      '1388',
      {
        accountCode: '1388',
        accountName: 'Reconciliation Discrepancies Receivable',
        accountType: 'ASSET',
        balanceVnd: 0,
      },
    ],
    [
      '3388',
      {
        accountCode: '3388',
        accountName: 'Customer Refund Obligations',
        accountType: 'LIABILITY',
        balanceVnd: 0,
      },
    ],
    [
      '5110',
      {
        accountCode: '5110',
        accountName: 'Gross Sales Revenue',
        accountType: 'REVENUE',
        balanceVnd: 660000,
      },
    ],
    [
      '5210',
      {
        accountCode: '5210',
        accountName: 'Sales Returns & Deductions',
        accountType: 'REVENUE',
        balanceVnd: 0,
      },
    ],
    [
      '6410',
      {
        accountCode: '6410',
        accountName: 'Payment Gateway Processing Fees',
        accountType: 'EXPENSE',
        balanceVnd: 0,
      },
    ],
    [
      '6420',
      {
        accountCode: '6420',
        accountName: 'Carrier COD Processing Fees',
        accountType: 'EXPENSE',
        balanceVnd: 15000,
      },
    ],
  ])

  const initialEntry: JournalEntry = {
    entryId: 'je_init_sc11',
    eventType: 'PAYMENT_CAPTURED',
    referenceId: 'O-SC11',
    description: 'Payment captured for order O-SC11',
    postedAt: '2026-11-16T15:30:00Z',
    createdBy: 'PAYMENT_SERVICE',
    postings: [
      { accountCode: '1120', direction: 'DEBIT', amountVnd: 660000 },
      { accountCode: '5110', direction: 'CREDIT', amountVnd: 660000 },
    ],
  }

  const codDeliveryEntry: JournalEntry = {
    entryId: 'je_cod_delivery_01',
    eventType: 'COD_DELIVERY_CONFIRMED',
    referenceId: 'SHP-O-COD-01',
    description: '3PL COD delivery confirmed for parcel SHP-O-COD-01',
    postedAt: '2026-11-17T10:00:00Z',
    createdBy: 'FULFILLMENT_SERVICE',
    postings: [
      { accountCode: '1310', direction: 'DEBIT', amountVnd: 500000 },
      { accountCode: '5110', direction: 'CREDIT', amountVnd: 500000 },
    ],
  }

  return {
    accounts,
    entries: [initialEntry, codDeliveryEntry],
    batches: new Map(),
    lines: new Map(),
    cases: new Map(),
  }
}

export function handleLedgerMock(
  request: MockRequest,
  userId: string | null,
  state: MockFinanceState = getMockFinanceState()
): MockResponse | null {
  const { method } = request
  // Normalize path removing optional /api/v1 prefix
  let path = request.path
  if (path.startsWith('/api/v1')) {
    path = path.slice(7)
  }

  const body = (typeof request.body === 'object' && request.body !== null
    ? request.body
    : {}) as Record<string, unknown>

  // 1. Overview & Metrics
  if (method === 'GET' && path === '/admin/ledger/reconciliations/summary') {
    let reconciledBatches = 0
    let pendingBatches = 0
    for (const b of state.batches.values()) {
      if (b.status === 'RECONCILED') reconciledBatches++
      else pendingBatches++
    }

    let totalLinesProcessed = 0
    let matchedLines = 0
    let openDiscrepancies = 0
    let totalDiscrepancyVnd = 0

    for (const lineList of state.lines.values()) {
      totalLinesProcessed += lineList.length
      for (const l of lineList) {
        if (l.matchStatus === 'MATCHED' || l.matchStatus === 'RESOLVED') {
          matchedLines++
        } else if (l.matchStatus === 'DISCREPANCY_OPEN') {
          openDiscrepancies++
          const fee = Math.floor((l.grossAmountVnd * 1) / 100)
          const expected = l.grossAmountVnd - fee
          totalDiscrepancyVnd += expected - l.netAmountVnd
        }
      }
    }

    const overview: ReconciliationOverview = {
      totalBatches: state.batches.size,
      reconciledBatches,
      pendingBatches,
      totalLinesProcessed,
      matchedLines,
      openDiscrepancies,
      totalDiscrepancyVnd,
    }
    return ok(overview, 'Reconciliation overview retrieved')
  }

  // 2. Chart of Accounts
  if (method === 'GET' && path === '/admin/ledger/accounts') {
    return ok(Array.from(state.accounts.values()), 'Accounts retrieved')
  }

  // 3. Journal Entries
  if (method === 'GET' && path === '/admin/ledger/entries') {
    const referenceId = request.query?.referenceId
    let result = state.entries
    if (referenceId) {
      result = result.filter((e) => e.referenceId === referenceId)
    }
    return ok(result, 'Journal entries retrieved')
  }

  // 4. Settlement Batches List
  if (method === 'GET' && path === '/admin/ledger/settlements/batches') {
    const batches = Array.from(state.batches.values()).sort(
      (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
    )
    return ok(batches, 'Settlement batches retrieved')
  }

  // 5. Settlement Batch Lines
  const linesMatch = path.match(/^\/admin\/ledger\/settlements\/batches\/([^/]+)\/lines$/)
  if (method === 'GET' && linesMatch) {
    const batchId = decodeURIComponent(linesMatch[1])
    const lines = state.lines.get(batchId) || []
    return ok(lines, 'Settlement lines retrieved')
  }

  // 6. Settlement CSV Import (Idempotent)
  if (method === 'POST' && path === '/admin/ledger/settlements/import') {
    const content = String(body.content || '')
    const s3Key = String(body.s3Key || '')
    if (!content.trim()) {
      return failure(400, 'CONTENT_REQUIRED', 'CSV content or file upload is required')
    }

    // Generate mock hash
    let hashNum = 0
    for (let i = 0; i < content.length; i++) {
      hashNum = (hashNum * 31 + content.charCodeAt(i)) >>> 0
    }
    const fileHash = `hash_${hashNum.toString(16)}`

    // Check idempotency
    for (const b of state.batches.values()) {
      if (b.fileHash === fileHash) {
        return ok(
          { batch: b, alreadyImported: true, linesCount: b.totalRows },
          'Settlement CSV already imported',
          200
        )
      }
    }

    // Parse lines
    const rawLines = content.split('\n').map((l) => l.trim()).filter(Boolean)
    if (rawLines.length < 2) {
      return failure(400, 'INVALID_CSV', 'CSV must have header and at least one row')
    }

    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`
    const parsedLines: SettlementLine[] = []
    let totalGross = 0
    let totalFee = 0
    let totalNet = 0

    for (let i = 1; i < rawLines.length; i++) {
      const parts = rawLines[i].split(',').map((p) => p.trim())
      if (parts.length < 7) continue
      const [txRef, orderId, txType, grossStr, feeStr, netStr, transactedAt] = parts
      const gross = parseInt(grossStr, 10) || 0
      const fee = parseInt(feeStr, 10) || 0
      const net = parseInt(netStr, 10) || 0

      totalGross += gross
      totalFee += fee
      totalNet += net

      parsedLines.push({
        lineId: i,
        batchId,
        lineNumber: i,
        transactionRef: txRef,
        orderId,
        type: (txType as SettlementLine['type']) || 'COLLECTION',
        grossAmountVnd: gross,
        feeAmountVnd: fee,
        netAmountVnd: net,
        transactedAt: transactedAt || new Date().toISOString(),
        matchStatus: 'PENDING',
      })
    }

    const batch: SettlementBatch = {
      batchId,
      filename: s3Key ? s3Key.split('/').pop() || 'settlement.csv' : 'settlement.csv',
      s3Key,
      fileHash,
      totalRows: parsedLines.length,
      totalGrossVnd: totalGross,
      totalFeeVnd: totalFee,
      totalNetVnd: totalNet,
      status: 'IMPORTED',
      importedBy: userId || 'SYSTEM',
      importedAt: new Date().toISOString(),
    }

    state.batches.set(batchId, batch)
    state.lines.set(batchId, parsedLines)

    return ok(
      { batch, alreadyImported: false, linesCount: parsedLines.length },
      'Settlement batch imported successfully',
      201
    )
  }

  // 7. Settlement Batch Match Execution
  const matchMatch = path.match(/^\/admin\/ledger\/settlements\/batches\/([^/]+)\/match$/)
  if (method === 'POST' && matchMatch) {
    const batchId = decodeURIComponent(matchMatch[1])
    const batch = state.batches.get(batchId)
    if (!batch) {
      return failure(404, 'NOT_FOUND', 'Settlement batch not found')
    }

    const lines = state.lines.get(batchId) || []
    let matchedLines = 0
    let discrepancyLines = 0
    let totalDiscrepancy = 0
    let entriesCreated = 0

    const results: BatchMatchSummary['results'] = []

    for (const line of lines) {
      const calculatedFee = Math.floor((line.grossAmountVnd * 1) / 100)
      const expectedPayout = line.grossAmountVnd - calculatedFee
      const diff = expectedPayout - line.netAmountVnd

      if (diff === 0) {
        line.matchStatus = 'MATCHED'
        matchedLines++
        results.push({
          lineNumber: line.lineNumber,
          transactionRef: line.transactionRef,
          orderId: line.orderId,
          grossAmountVnd: line.grossAmountVnd,
          calculatedFeeVnd: calculatedFee,
          expectedPayoutVnd: expectedPayout,
          actualPayoutVnd: line.netAmountVnd,
          discrepancyVnd: 0,
          status: 'MATCHED',
          message: `Line #${line.lineNumber} matched perfectly with 1% fee (${calculatedFee} VND)`,
        })

        // Post balanced journal entry: Debit 1110 (net), Debit 6410 (fee), Credit 1120 (gross)
        const entryId = `je_match_${batchId}_${line.lineNumber}`
        state.entries.push({
          entryId,
          eventType: 'SETTLEMENT_MATCHED',
          referenceId: `${batchId}:${line.orderId}`,
          description: `Settlement payout matched for order ${line.orderId} (batch ${batchId})`,
          postedAt: new Date().toISOString(),
          createdBy: userId || 'SYSTEM',
          postings: [
            { accountCode: '1110', direction: 'DEBIT', amountVnd: line.netAmountVnd },
            { accountCode: '6410', direction: 'DEBIT', amountVnd: calculatedFee },
            { accountCode: '1120', direction: 'CREDIT', amountVnd: line.grossAmountVnd },
          ],
        })
        entriesCreated++
      } else {
        line.matchStatus = 'DISCREPANCY_OPEN'
        discrepancyLines++
        totalDiscrepancy += diff
        results.push({
          lineNumber: line.lineNumber,
          transactionRef: line.transactionRef,
          orderId: line.orderId,
          grossAmountVnd: line.grossAmountVnd,
          calculatedFeeVnd: calculatedFee,
          expectedPayoutVnd: expectedPayout,
          actualPayoutVnd: line.netAmountVnd,
          discrepancyVnd: diff,
          status: 'DISCREPANCY_OPEN',
          message: `Line #${line.lineNumber} discrepancy detected: expected ${expectedPayout} VND, partner paid ${line.netAmountVnd} VND (shortfall ${diff} VND)`,
        })

        // Post balanced entry with 1388 shortfall:
        // Debit 1110 (net: 650,000)
        // Debit 6410 (fee: 6,600)
        // Debit 1388 (shortfall: 3,400)
        // Credit 1120 (gross: 660,000)
        const entryId = `je_match_${batchId}_${line.lineNumber}`
        state.entries.push({
          entryId,
          eventType: 'SETTLEMENT_MATCHED',
          referenceId: `${batchId}:${line.orderId}`,
          description: `Settlement payout matched with discrepancy for order ${line.orderId} (batch ${batchId})`,
          postedAt: new Date().toISOString(),
          createdBy: userId || 'SYSTEM',
          postings: [
            { accountCode: '1110', direction: 'DEBIT', amountVnd: line.netAmountVnd },
            { accountCode: '6410', direction: 'DEBIT', amountVnd: calculatedFee },
            { accountCode: '1388', direction: 'DEBIT', amountVnd: diff },
            { accountCode: '1120', direction: 'CREDIT', amountVnd: line.grossAmountVnd },
          ],
        })
        entriesCreated++

        // Update account balances
        const acc1110 = state.accounts.get('1110')
        if (acc1110) acc1110.balanceVnd += line.netAmountVnd
        const acc6410 = state.accounts.get('6410')
        if (acc6410) acc6410.balanceVnd += calculatedFee
        const acc1388 = state.accounts.get('1388')
        if (acc1388) acc1388.balanceVnd += diff
        const acc1120 = state.accounts.get('1120')
        if (acc1120) acc1120.balanceVnd -= line.grossAmountVnd

        // Create open discrepancy case
        const caseId = `case_${batchId}_${line.lineNumber}`
        state.cases.set(caseId, {
          caseId,
          batchId,
          lineNumber: line.lineNumber,
          orderId: line.orderId,
          transactionRef: line.transactionRef,
          expectedPayoutVnd: expectedPayout,
          actualPayoutVnd: line.netAmountVnd,
          discrepancyVnd: diff,
          causeCategory: 'UNCLASSIFIED',
          status: 'OPEN',
          assignedTo: 'FINANCE_TEAM',
          resolvedBy: '',
          resolutionNotes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }

    batch.status = discrepancyLines > 0 ? 'PARTIALLY_RECONCILED' : 'RECONCILED'

    const summary: BatchMatchSummary = {
      batchId,
      totalLines: lines.length,
      matchedLines,
      discrepancyLines,
      totalGrossVnd: batch.totalGrossVnd,
      totalFeeVnd: batch.totalFeeVnd,
      totalNetVnd: batch.totalNetVnd,
      totalDiscrepancyVnd: totalDiscrepancy,
      journalEntriesCreated: entriesCreated,
      batchStatus: batch.status,
      results,
    }

    return ok(summary, 'Batch reconciliation matched successfully')
  }

  // 8. Discrepancy Cases List
  if (method === 'GET' && path === '/admin/ledger/discrepancies') {
    const status = request.query?.status
    const batchId = request.query?.batchId
    let cases = Array.from(state.cases.values())
    if (status) {
      cases = cases.filter((c) => c.status === status)
    }
    if (batchId) {
      cases = cases.filter((c) => c.batchId === batchId)
    }
    cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return ok(cases, 'Discrepancy cases retrieved')
  }

  // 9. Single Discrepancy Case
  const caseMatch = path.match(/^\/admin\/ledger\/discrepancies\/([^/]+)$/)
  if (method === 'GET' && caseMatch) {
    const caseId = decodeURIComponent(caseMatch[1])
    const c = state.cases.get(caseId)
    if (!c) {
      return failure(404, 'NOT_FOUND', 'Discrepancy case not found')
    }
    return ok(c, 'Discrepancy case retrieved')
  }

  // 10. Resolve Discrepancy Case
  const resolveMatch = path.match(/^\/admin\/ledger\/discrepancies\/([^/]+)\/resolve$/)
  if (method === 'POST' && resolveMatch) {
    const caseId = decodeURIComponent(resolveMatch[1])
    const c = state.cases.get(caseId)
    if (!c) {
      return failure(404, 'NOT_FOUND', 'Discrepancy case not found')
    }
    if (c.status === 'RESOLVED') {
      return failure(409, 'ALREADY_RESOLVED', 'Discrepancy case is already resolved')
    }

    const causeCategory = String(body.causeCategory || '') as DiscrepancyCauseCategory
    const resolutionNotes = String(body.resolutionNotes || '')
    const compensatingAccount = String(body.compensatingAccountCode || '6410')

    if (!causeCategory) {
      return failure(400, 'CATEGORY_REQUIRED', 'Cause category is required')
    }
    if (!resolutionNotes) {
      return failure(400, 'NOTES_REQUIRED', 'Resolution notes are required')
    }

    // Post compensating journal entry: Debit compensatingAccount (6410), Credit 1388
    const entryId = `je_resolve_${caseId}`
    const journalEntry: JournalEntry = {
      entryId,
      eventType: 'DISCREPANCY_RESOLVED',
      referenceId: caseId,
      description: `Discrepancy resolved for case ${caseId} (order ${c.orderId}, ${causeCategory}): ${resolutionNotes}`,
      postedAt: new Date().toISOString(),
      createdBy: userId || 'FINANCE_MGR',
      postings: [
        { accountCode: compensatingAccount, direction: 'DEBIT', amountVnd: c.discrepancyVnd },
        { accountCode: '1388', direction: 'CREDIT', amountVnd: c.discrepancyVnd },
      ],
    }
    state.entries.push(journalEntry)

    // Update account balances: 1388 is cleared, 6410 receives fee
    const acc1388 = state.accounts.get('1388')
    if (acc1388) acc1388.balanceVnd -= c.discrepancyVnd
    const accComp = state.accounts.get(compensatingAccount)
    if (accComp) accComp.balanceVnd += c.discrepancyVnd

    // Update case
    c.status = 'RESOLVED'
    c.causeCategory = causeCategory
    c.resolutionNotes = resolutionNotes
    c.resolvedBy = userId || 'FINANCE_MGR'
    c.resolvedAt = new Date().toISOString()
    c.updatedAt = new Date().toISOString()

    // Update settlement line
    const lines = state.lines.get(c.batchId) || []
    const line = lines.find((l) => l.lineNumber === c.lineNumber)
    if (line) {
      line.matchStatus = 'RESOLVED'
    }

    return ok(
      { case: c, journalEntry },
      'Discrepancy case resolved with compensating journal entry'
    )
  }

  return null
}
