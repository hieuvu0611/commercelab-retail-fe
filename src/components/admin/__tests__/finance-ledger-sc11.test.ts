import {
  handleLedgerMock,
  getMockFinanceState,
  resetMockFinanceState,
} from '@/finance/mock-finance'
import type { MockRequest } from '@/auth/mock-api'
import type {
  BatchMatchSummary,
  JournalEntry,
  LedgerAccount,
  ReconciliationCase,
  SettlementBatch,
} from '@/types/finance'

describe('End-to-End Finance Ledger & Settlement Reconciliation (P10: SC11, B07, I06)', () => {
  beforeEach(() => {
    resetMockFinanceState()
  })

  test('Step 1: Chart of Accounts & Initial Order Payment Entry (660,000 VND)', () => {
    const state = getMockFinanceState()

    const accountsReq: MockRequest = {
      method: 'GET',
      path: '/api/v1/admin/ledger/accounts',
    }
    const accountsRes = handleLedgerMock(accountsReq, 'fin-01', state)
    expect(accountsRes?.status).toBe(200)

    const accounts = (accountsRes?.body as { data: LedgerAccount[] })?.data
    expect(accounts.length).toBe(7)

    const acc1120 = state.accounts.get('1120')
    const acc5110 = state.accounts.get('5110')
    expect(acc1120?.balanceVnd).toBe(660_000)
    expect(acc5110?.balanceVnd).toBe(660_000)

    // Check initial journal entry
    const entriesReq: MockRequest = {
      method: 'GET',
      path: '/api/v1/admin/ledger/entries',
    }
    const entriesRes = handleLedgerMock(entriesReq, 'fin-01', state)
    expect(entriesRes?.status).toBe(200)
    const entries = (entriesRes?.body as { data: JournalEntry[] })?.data
    expect(entries.length).toBe(1)
    expect(entries[0].referenceId).toBe('O-SC11')
  })

  test('Step 2: Idempotent Settlement CSV Import from Gateway (SC11)', () => {
    const state = getMockFinanceState()
    const csvContent = `transaction_ref,order_id,type,gross_amount_vnd,fee_amount_vnd,net_amount_vnd,transacted_at
TX-VNPAY-SC11,O-SC11,COLLECTION,660000,6600,650000,2026-11-16T15:30:00+07:00
TX-VNPAY-100K,O-100K,COLLECTION,100000,1000,99000,2026-11-16T16:00:00+07:00`

    // First import
    const importReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/ledger/settlements/import',
      body: {
        s3Key: 'settlements/20261116.csv',
        content: csvContent,
      },
    }
    const importRes = handleLedgerMock(importReq, 'fin-01', state)
    expect(importRes?.status).toBe(201)
    const importData = (importRes?.body as { data: { batch: SettlementBatch; alreadyImported: boolean; linesCount: number } })?.data
    expect(importData.alreadyImported).toBe(false)
    expect(importData.linesCount).toBe(2)
    const batchId = importData.batch.batchId
    expect(batchId).toBeDefined()

    // Second import with identical content must be strictly idempotent
    const reimportRes = handleLedgerMock(importReq, 'fin-01', state)
    expect(reimportRes?.status).toBe(200)
    const reimportData = (reimportRes?.body as { data: { batch: SettlementBatch; alreadyImported: boolean } })?.data
    expect(reimportData.alreadyImported).toBe(true)
    expect(reimportData.batch.batchId).toBe(batchId)
    expect(state.batches.size).toBe(1)
  })

  test('Step 3: Matching Engine Detects SC11 Shortfall (3,400 VND) and Posts Balanced Entry', () => {
    const state = getMockFinanceState()
    const csvContent = `transaction_ref,order_id,type,gross_amount_vnd,fee_amount_vnd,net_amount_vnd,transacted_at
TX-VNPAY-SC11,O-SC11,COLLECTION,660000,6600,650000,2026-11-16T15:30:00+07:00`

    const importReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/ledger/settlements/import',
      body: { s3Key: 'settlements/sc11.csv', content: csvContent },
    }
    const importRes = handleLedgerMock(importReq, 'fin-01', state)
    const batchId = (importRes?.body as { data: { batch: SettlementBatch } })?.data?.batch?.batchId

    // Execute match
    const matchReq: MockRequest = {
      method: 'POST',
      path: `/api/v1/admin/ledger/settlements/batches/${batchId}/match`,
    }
    const matchRes = handleLedgerMock(matchReq, 'fin-01', state)
    expect(matchRes?.status).toBe(200)

    const summary = (matchRes?.body as { data: BatchMatchSummary })?.data
    expect(summary.totalLines).toBe(1)
    expect(summary.matchedLines).toBe(0)
    expect(summary.discrepancyLines).toBe(1)
    expect(summary.totalDiscrepancyVnd).toBe(3400)
    expect(summary.batchStatus).toBe('PARTIALLY_RECONCILED')

    // Verify balanced double-entry:
    // Debit 1110: 650,000, Debit 6410: 6,600, Debit 1388: 3,400 = Credit 1120: 660,000
    const matchEntry = state.entries.find((e) => e.eventType === 'SETTLEMENT_MATCHED')
    expect(matchEntry).toBeDefined()
    let debitSum = 0
    let creditSum = 0
    for (const p of matchEntry!.postings) {
      if (p.direction === 'DEBIT') debitSum += p.amountVnd
      else creditSum += p.amountVnd
    }
    expect(debitSum).toBe(660_000)
    expect(creditSum).toBe(660_000)

    // Check Account 1388 has 3,400 VND receivable shortfall
    expect(state.accounts.get('1388')?.balanceVnd).toBe(3400)

    // Check Open Discrepancy Case created
    expect(state.cases.size).toBe(1)
    const openCase = Array.from(state.cases.values())[0]
    expect(openCase.orderId).toBe('O-SC11')
    expect(openCase.discrepancyVnd).toBe(3400)
    expect(openCase.status).toBe('OPEN')
  })

  test('Step 4: Resolve Discrepancy Case with Compensating Journal Entry (I06 Compliance)', () => {
    const state = getMockFinanceState()
    const csvContent = `transaction_ref,order_id,type,gross_amount_vnd,fee_amount_vnd,net_amount_vnd,transacted_at
TX-VNPAY-SC11,O-SC11,COLLECTION,660000,6600,650000,2026-11-16T15:30:00+07:00`

    const importRes = handleLedgerMock(
      {
        method: 'POST',
        path: '/api/v1/admin/ledger/settlements/import',
        body: { content: csvContent },
      },
      'fin-01',
      state
    )
    const batchId = (importRes?.body as { data: { batch: SettlementBatch } })?.data?.batch?.batchId
    handleLedgerMock(
      {
        method: 'POST',
        path: `/api/v1/admin/ledger/settlements/batches/${batchId}/match`,
      },
      'fin-01',
      state
    )

    const caseId = Array.from(state.cases.keys())[0]
    expect(caseId).toBeDefined()

    // Resolve case as FEE_ADJUSTMENT
    const resolveReq: MockRequest = {
      method: 'POST',
      path: `/api/v1/admin/ledger/discrepancies/${caseId}/resolve`,
      body: {
        causeCategory: 'FEE_ADJUSTMENT',
        resolutionNotes: 'Partner gateway applied international card surcharge; verified per contract annex B',
        compensatingAccountCode: '6410',
      },
    }
    const resolveRes = handleLedgerMock(resolveReq, 'fin-mgr-01', state)
    expect(resolveRes?.status).toBe(200)

    const resolvedCase = (resolveRes?.body as { data: { case: ReconciliationCase } })?.data.case
    expect(resolvedCase.status).toBe('RESOLVED')
    expect(resolvedCase.causeCategory).toBe('FEE_ADJUSTMENT')
    expect(resolvedCase.resolvedBy).toBe('fin-mgr-01')

    // Verify compensating entry was posted: Debit 6410 (3,400), Credit 1388 (3,400)
    const resolveEntry = state.entries.find((e) => e.eventType === 'DISCREPANCY_RESOLVED')
    expect(resolveEntry).toBeDefined()
    expect(resolveEntry?.postings).toEqual([
      { accountCode: '6410', direction: 'DEBIT', amountVnd: 3400 },
      { accountCode: '1388', direction: 'CREDIT', amountVnd: 3400 },
    ])

    // Account 1388 balance is now cleared to 0
    expect(state.accounts.get('1388')?.balanceVnd).toBe(0)

    // Original collection revenue of 660,000 VND remains strictly preserved (Policy I06)
    expect(state.accounts.get('5110')?.balanceVnd).toBe(660_000)

    // Repeated resolution returns 409 Conflict
    const dupRes = handleLedgerMock(resolveReq, 'fin-mgr-01', state)
    expect(dupRes?.status).toBe(409)
  })
})
