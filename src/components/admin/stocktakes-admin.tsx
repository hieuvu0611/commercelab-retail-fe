'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import {
  createStocktake,
  listStocktakes,
  STOCKTAKES_KEY,
  submitStocktakeCount,
} from '@/procurement/procurement-api'
import type { Stocktake } from '@/types/procurement'
import { WAREHOUSES } from '@/configs/roles'
import { InventoryNav } from './inventory-nav'
import { StaffOnly } from './staff-only'
import { WAREHOUSE_OPS_ROLES } from './receiving-admin'

interface CountInput {
  skuId: string
  systemOnHand: number
  countedOnHand: number
  unitCostVnd: number
}

export function StocktakesAdmin() {
  return (
    <StaffOnly role={WAREHOUSE_OPS_ROLES} what="perform warehouse stocktakes">
      <StocktakesAdminView />
    </StaffOnly>
  )
}

function StocktakesAdminView() {
  const queryClient = useQueryClient()
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedStocktake, setSelectedStocktake] = useState<Stocktake | null>(null)
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0] || 'WH-HCM-01')
  const [startNotes, setStartNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [countInputs, setCountInputs] = useState<CountInput[]>([
    {
      skuId: 'SKU-BACKPACK-BLK',
      systemOnHand: 85,
      countedOnHand: 82,
      unitCostVnd: 150_000,
    },
  ])

  const { data: stocktakes = [], isLoading: loadingStocktakes } = useQuery({
    queryKey: STOCKTAKES_KEY,
    queryFn: () => listStocktakes(),
  })

  const startMutation = useMutation({
    mutationFn: () => createStocktake(warehouseId, startNotes),
    onSuccess: (newStk) => {
      queryClient.invalidateQueries({ queryKey: STOCKTAKES_KEY })
      setShowStartModal(false)
      setSelectedStocktake(newStk)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to start stocktake'
      setFormError(msg)
    },
  })

  const countMutation = useMutation({
    mutationFn: ({
      stocktakeId,
      lines,
    }: {
      stocktakeId: string
      lines: Array<{ skuId: string; countedOnHand: number; unitCostVnd?: number }>
    }) => submitStocktakeCount(stocktakeId, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCKTAKES_KEY })
      setSelectedStocktake(null)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to submit count'
      setFormError(msg)
    },
  })

  const openCountModal = (stk: Stocktake) => {
    setSelectedStocktake(stk)
    setFormError('')
    if (stk.lines && stk.lines.length > 0) {
      setCountInputs(
        stk.lines.map((l) => ({
          skuId: l.skuId,
          systemOnHand: l.systemOnHand,
          countedOnHand: l.countedOnHand,
          unitCostVnd: l.unitCostVnd,
        }))
      )
    }
  }

  const handleAddLine = () => {
    setCountInputs((prev) => [
      ...prev,
      {
        skuId: `SKU-${Date.now().toString().slice(-4)}`,
        systemOnHand: 10,
        countedOnHand: 10,
        unitCostVnd: 100_000,
      },
    ])
  }

  const handleUpdateLine = (index: number, field: keyof CountInput, val: unknown) => {
    setCountInputs((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: val }
      return next
    })
  }

  const handleRemoveLine = (index: number) => {
    setCountInputs((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmitCounts = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!selectedStocktake) return

    countMutation.mutate({
      stocktakeId: selectedStocktake.stocktakeId,
      lines: countInputs.map((l) => ({
        skuId: l.skuId,
        countedOnHand: l.countedOnHand,
        unitCostVnd: l.unitCostVnd,
      })),
    })
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">Warehouse Stocktakes</h1>
          <p className="text-sm text-ink-2 mt-1">
            Perform physical count audits and create discrepancy adjustments with automatic sales-blocking (Policy I01).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowStartModal(true)
            setStartNotes('Routine cycle count audit')
          }}
          className="rounded-button bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Start Stocktake Session
        </button>
      </div>

      <InventoryNav />

      {/* Policy Callout */}
      <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
        <div className="font-semibold">⚠️ Inventory Protection (Policy I01 & Maker ≠ Checker P10)</div>
        <div>
          When a stock count reveals a shortage (<code className="rounded bg-amber-100 px-1 py-0.5">counted &lt; system</code>),
          the discrepancy is immediately quarantined to block storefront sales.
          Adjustments must be independently approved by a second manager before stock ledger writes occur.
        </div>
      </div>

      {/* Start Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-xl space-y-4 text-xs">
            <h3 className="font-heading text-lg font-bold text-ink">Start Stocktake Session</h3>
            {formError && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3 text-red-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block font-semibold text-ink mb-1">Warehouse</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
              >
                {WAREHOUSES.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-ink mb-1">Session Notes</label>
              <input
                type="text"
                value={startNotes}
                onChange={(e) => setStartNotes(e.target.value)}
                className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                placeholder="e.g. End of month wall-to-wall count"
              />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-rule">
              <button
                type="button"
                onClick={() => setShowStartModal(false)}
                className="rounded-button border border-rule-2 bg-paper px-4 py-2 font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="rounded-button bg-accent px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {startMutation.isPending ? 'Starting...' : 'Start Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Count Entry Modal */}
      {selectedStocktake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-3xl rounded-card border border-rule bg-paper p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-ink">
                  Enter Physical Counts: {selectedStocktake.stocktakeId}
                </h3>
                <p className="text-xs text-ink-2">Warehouse: {selectedStocktake.warehouseId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStocktake(null)}
                className="text-ink-2 hover:text-ink text-sm font-semibold"
              >
                ✕ Close
              </button>
            </div>

            {formError && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitCounts} className="space-y-4 text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-rule bg-paper-2 text-ink font-semibold">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">System OnHand</th>
                      <th className="p-2">Counted Physical</th>
                      <th className="p-2">Difference</th>
                      <th className="p-2">Impact / Action</th>
                      <th className="p-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {countInputs.map((line, idx) => {
                      const diff = line.countedOnHand - line.systemOnHand
                      return (
                        <tr key={idx} className={diff < 0 ? 'bg-amber-50/60' : diff > 0 ? 'bg-blue-50/60' : ''}>
                          <td className="p-2">
                            <input
                              type="text"
                              value={line.skuId}
                              onChange={(e) => handleUpdateLine(idx, 'skuId', e.target.value)}
                              className="rounded border border-rule-2 bg-paper px-2 py-1 font-mono text-xs w-36"
                              required
                            />
                          </td>
                          <td className="p-2 text-ink-2 font-medium">{line.systemOnHand}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={line.countedOnHand}
                              onChange={(e) =>
                                handleUpdateLine(idx, 'countedOnHand', Number(e.target.value))
                              }
                              className="w-20 rounded border border-rule-2 bg-paper px-2 py-1 text-xs"
                              required
                            />
                          </td>
                          <td className="p-2 font-semibold">
                            {diff === 0 ? (
                              <span className="text-gray-500">0</span>
                            ) : diff > 0 ? (
                              <span className="text-blue-700">+{diff} (surplus)</span>
                            ) : (
                              <span className="text-red-600 font-bold">{diff} (shortage)</span>
                            )}
                          </td>
                          <td className="p-2">
                            {diff < 0 ? (
                              <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                                🔒 Sales Blocked for Discrepancy
                              </span>
                            ) : diff > 0 ? (
                              <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                Pending Adjustment
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">Match</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="rounded border border-rule-2 bg-paper px-3 py-1.5 font-medium text-ink hover:bg-paper-2"
                >
                  + Add SKU Line
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setSelectedStocktake(null)}
                  className="rounded-button border border-rule-2 bg-paper px-4 py-2 font-medium text-ink hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={countMutation.isPending}
                  className="rounded-button bg-accent px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {countMutation.isPending ? 'Submitting...' : 'Submit Counts & Quarantine Shortages'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stocktakes List */}
      <div className="rounded-card border border-rule bg-paper p-5 space-y-4">
        <h2 className="font-heading text-lg font-semibold text-ink">Stocktake Sessions</h2>
        {loadingStocktakes ? (
          <p className="text-sm text-ink-2">Loading stocktakes...</p>
        ) : stocktakes.length === 0 ? (
          <p className="text-sm text-ink-2">No stocktake sessions recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Stocktake ID</th>
                  <th className="px-3 py-2.5">Warehouse</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Started By</th>
                  <th className="px-3 py-2.5">Discrepancies</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {stocktakes.map((stk) => {
                  const hasDiscrepancy = stk.lines?.some((l) => l.diffQty !== 0)
                  return (
                    <tr key={stk.stocktakeId} className="hover:bg-paper-2">
                      <td className="px-3 py-2.5 font-medium text-ink">{stk.stocktakeId}</td>
                      <td className="px-3 py-2.5 text-ink-2">{stk.warehouseId}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            stk.status === 'SUBMITTED' || stk.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {stk.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{stk.startedBy}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {stk.lines && stk.lines.length > 0 ? (
                          hasDiscrepancy ? (
                            <span className="font-semibold text-amber-700">
                              Discrepancy found (adjustments created)
                            </span>
                          ) : (
                            <span className="text-green-700 font-medium">100% Match</span>
                          )
                        ) : (
                          <span className="text-ink-2">Counts pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {stk.status === 'IN_PROGRESS' ? (
                          <button
                            type="button"
                            onClick={() => openCountModal(stk)}
                            className="rounded-button bg-accent px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                          >
                            Enter Counts
                          </button>
                        ) : (
                          <Link
                            href="/admin/inventory/adjustments"
                            className="text-accent hover:underline text-xs font-medium"
                          >
                            View Adjustments →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
