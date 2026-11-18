import { storefrontApi } from '@/services/api/clients'
import {
  getReconciliationOverview,
  listAccounts,
  listJournalEntries,
  listSettlementBatches,
} from '@/finance/finance-api'

describe('finance-api paginated response unwrapping', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('unwraps paginated journal entries object from ledger-reconciliation-service', async () => {
    const sample = [{ entryId: 'JE-1', referenceId: 'O-1', postings: [] }]
    jest.spyOn(storefrontApi, 'get').mockResolvedValueOnce({
      data: { entries: sample, total: 1, limit: 50, offset: 0 },
    } as never)

    await expect(listJournalEntries()).resolves.toEqual(sample)
  })

  it('supports direct array or nullish payload for journal entries and batches', async () => {
    const batch = { batchId: 'BATCH-1', filename: 's.csv' }
    jest
      .spyOn(storefrontApi, 'get')
      .mockResolvedValueOnce({ data: null } as never)
      .mockResolvedValueOnce({
        data: { batches: [batch], total: 1, limit: 50, offset: 0 },
      } as never)
      .mockResolvedValueOnce({ data: null } as never)

    await expect(listJournalEntries()).resolves.toEqual([])
    await expect(listSettlementBatches()).resolves.toEqual([batch])
    await expect(listAccounts()).resolves.toEqual([])
  })

  it('uses totalDiscrepancyVnd fallback when overview response is empty', async () => {
    jest.spyOn(storefrontApi, 'get').mockResolvedValueOnce({ data: undefined } as never)

    await expect(getReconciliationOverview()).resolves.toEqual({
      totalBatches: 0,
      reconciledBatches: 0,
      pendingBatches: 0,
      totalLinesProcessed: 0,
      matchedLines: 0,
      openDiscrepancies: 0,
      totalDiscrepancyVnd: 0,
    })
  })
})
