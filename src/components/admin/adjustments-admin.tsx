'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import {
  decideStockAdjustment,
  listStockAdjustments,
  STOCK_ADJUSTMENTS_KEY,
} from '@/procurement/procurement-api'
import type { StockAdjustment } from '@/types/procurement'
import { InventoryNav } from './inventory-nav'
import { StaffOnly } from './staff-only'

export const ADJUSTMENT_ROLES = [
  'WAREHOUSE_MGR',
  'SUPPLY_CHAIN_MGR',
  'OPS_MGR',
  'FINANCE_MGR',
  'ADMIN',
] as const

export function AdjustmentsAdmin() {
  return (
    <StaffOnly role={ADJUSTMENT_ROLES} what="review and approve inventory adjustments">
      <AdjustmentsAdminView />
    </StaffOnly>
  )
}

function AdjustmentsAdminView() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''

  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [rejectItem, setRejectItem] = useState<StockAdjustment | null>(null)
  const [rejectNote, setRejectNote] = useState<string>('')
  const [actionError, setActionError] = useState<string>('')

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: STOCK_ADJUSTMENTS_KEY,
    queryFn: () => listStockAdjustments(),
  })

  const decideMutation = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string
      action: 'APPROVE' | 'REJECT'
      note?: string
    }) => decideStockAdjustment(id, action, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_ADJUSTMENTS_KEY })
      setRejectItem(null)
      setRejectNote('')
      setActionError('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Action failed'
      setActionError(msg)
    },
  })

  const filtered = adjustments.filter((adj) => {
    if (statusFilter === 'ALL') return true
    return adj.status === statusFilter
  })

  const handleApprove = (adj: StockAdjustment) => {
    setActionError('')
    decideMutation.mutate({ id: adj.adjustmentId, action: 'APPROVE' })
  }

  const handleConfirmReject = () => {
    if (!rejectItem) return
    setActionError('')
    decideMutation.mutate({ id: rejectItem.adjustmentId, action: 'REJECT', note: rejectNote.trim() })
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">Inventory Adjustments Queue</h1>
          <p className="text-sm text-ink-2 mt-1">
            Review stock discrepancy adjustments with threshold authority and Maker ≠ Checker compliance (P10).
          </p>
        </div>
      </div>

      <InventoryNav />

      {/* Threshold Guide */}
      <div className="rounded-card border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
        <div className="font-semibold">⚖️ Approval Authority Thresholds (Policy P10)</div>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <span className="font-medium">Standard Adjustment (≤ 5 units AND ≤ 2,000,000 VND):</span> Approved by Warehouse Manager or above.
          </li>
          <li>
            <span className="font-medium">High-Impact Adjustment (&gt; 5 units OR &gt; 2,000,000 VND):</span> Requires Supply Chain / Operations Manager or Finance Director.
          </li>
          <li>
            <span className="font-medium font-bold text-red-700">Maker ≠ Checker Rule:</span> The staff member who submitted the stock count cannot approve their own adjustment.
          </li>
        </ul>
      </div>

      {actionError && (
        <div className="rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {actionError}
        </div>
      )}

      {/* Reject Modal */}
      {rejectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-xl space-y-4 text-xs">
            <h3 className="font-heading text-lg font-bold text-ink">
              Reject Adjustment: {rejectItem.adjustmentId}
            </h3>
            <p className="text-ink-2">
              Provide justification for rejecting this inventory adjustment for {rejectItem.skuId} (diff: {rejectItem.diffQty}).
            </p>
            <div>
              <label className="block font-semibold text-ink mb-1">Rejection Reason</label>
              <textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Request recount before writing off goods"
                className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-rule">
              <button
                type="button"
                onClick={() => setRejectItem(null)}
                className="rounded-button border border-rule-2 bg-paper px-4 py-2 font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={decideMutation.isPending}
                className="rounded-button bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {decideMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and List */}
      <div className="rounded-card border border-rule bg-paper p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-ink">Adjustments List</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-2 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-rule-2 bg-paper px-2.5 py-1 text-ink"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-2">Loading adjustments...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-2">No adjustments matching filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Adjustment ID</th>
                  <th className="px-3 py-2.5">SKU / Warehouse</th>
                  <th className="px-3 py-2.5">Discrepancy</th>
                  <th className="px-3 py-2.5">Discrepancy Value</th>
                  <th className="px-3 py-2.5">Maker (Counted By)</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Approval Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map((adj) => {
                  const isMaker = currentUserId && adj.makerId === currentUserId
                  const isHighImpact = Math.abs(adj.diffQty) > 5 || Math.abs(adj.diffAmountVnd) > 2_000_000
                  const isApproved = adj.status === 'APPROVED'
                  const isRejected = adj.status === 'REJECTED'
                  const isPending = adj.status === 'PENDING_APPROVAL'

                  return (
                    <tr key={adj.adjustmentId} className="hover:bg-paper-2">
                      <td className="px-3 py-2.5 font-medium text-ink">
                        <div>{adj.adjustmentId}</div>
                        <div className="text-[11px] text-ink-2 font-mono">{adj.stocktakeId}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        <div className="font-mono font-medium">{adj.skuId}</div>
                        <div className="text-xs text-ink-2">{adj.warehouseId}</div>
                      </td>
                      <td className="px-3 py-2.5 font-bold">
                        {adj.diffQty < 0 ? (
                          <span className="text-red-600">{adj.diffQty} units (Shortage)</span>
                        ) : (
                          <span className="text-blue-600">+{adj.diffQty} units (Surplus)</span>
                        )}
                        <div className="text-[11px] font-normal text-ink-2">
                          {isHighImpact ? '⚠️ High Impact (>5 or >2M)' : 'Standard (≤5 & ≤2M)'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink font-medium">
                        {formatVnd(Math.abs(adj.diffAmountVnd))}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2 text-xs">
                        <div>{adj.makerId}</div>
                        {adj.checkerId && <div className="text-ink">Checker: {adj.checkerId}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isApproved
                              ? 'bg-green-100 text-green-800'
                              : isRejected
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {adj.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isPending && (
                          <div className="flex items-center justify-end gap-2">
                            {isMaker ? (
                              <button
                                type="button"
                                disabled
                                title="Policy P10: You cannot approve your own count discrepancy"
                                className="rounded border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs text-gray-500 cursor-not-allowed"
                              >
                                Self-Approval Blocked (P10)
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(adj)}
                                  disabled={decideMutation.isPending}
                                  className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectItem(adj)}
                                  disabled={decideMutation.isPending}
                                  className="rounded border border-red-300 bg-paper px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {!isPending && (
                          <span className="text-xs text-ink-2">
                            {isApproved ? 'Ledger Adjusted' : 'Count Rejected'}
                          </span>
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
