'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { formatVnd } from '@/catalog/money'
import { approvePurchaseOrder, getPurchaseOrder, purchaseOrderKey, rejectPurchaseOrder, PURCHASE_ORDERS_KEY } from '@/procurement/procurement-api'
import type { POStatus } from '@/types/procurement'
import { StaffOnly } from './staff-only'
import { PROCUREMENT_ROLES } from './purchasing-orders-admin'

const STATUS_LABELS: Record<POStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-paper-3 text-ink-2' },
  PENDING_APPROVAL: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', color: 'bg-blue-100 text-blue-800' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  ORDERED: { label: 'Ordered', color: 'bg-purple-100 text-purple-800' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', color: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700' },
}

interface PurchasingOrderDetailProps {
  poId: string
}

export function PurchasingOrderDetail({ poId }: PurchasingOrderDetailProps) {
  return (
    <StaffOnly role={PROCUREMENT_ROLES} what="view purchase order details">
      <PurchasingOrderDetailView poId={poId} />
    </StaffOnly>
  )
}

function PurchasingOrderDetailView({ poId }: PurchasingOrderDetailProps) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  const [rejectReason, setRejectReason] = useState<string>('')
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false)
  const [actionError, setActionError] = useState<string>('')

  const { data: po, isLoading, error } = useQuery({
    queryKey: purchaseOrderKey(poId),
    queryFn: () => getPurchaseOrder(poId),
  })

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(poId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKey(poId) })
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
      setActionError('')
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Approval failed'
      setActionError(message)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectPurchaseOrder(poId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKey(poId) })
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
      setShowRejectModal(false)
      setActionError('')
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Rejection failed'
      setActionError(message)
    },
  })

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted">Loading purchase order details...</div>
  }

  if (error || !po) {
    return <div className="p-8 text-center text-sm text-red-600">Failed to load purchase order {poId}</div>
  }

  const currentUserId = session?.user?.id || session?.user?.name || session?.user?.email
  const isMaker = Boolean(currentUserId && po.createdBy === currentUserId)
  const badge = STATUS_LABELS[po.status] || { label: po.status, color: 'bg-gray-100 text-gray-800' }
  const isHighValue = po.totalAmountVnd > 20_000_000

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold text-ink">{po.poId}</h1>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-sm text-ink-2">
            Created by <span className="font-medium text-ink">{po.createdBy}</span> on{' '}
            {new Date(po.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/admin/purchasing"
          className="rounded-button border border-rule-2 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-2"
        >
          Back to Orders
        </Link>
      </div>

      {actionError && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Threshold & Maker-Checker alerts */}
      <div className="space-y-3">
        <div className={`rounded-card border p-4 text-sm ${isHighValue ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
          <div className="font-semibold">
            {isHighValue ? '⚠️ High-Value Purchase Order (> 20,000,000 VND)' : 'ℹ️ Standard Purchase Order (≤ 20,000,000 VND)'}
          </div>
          <p className="mt-1 text-xs">
            {isHighValue
              ? 'Authority threshold: Requires Operations Director or Finance Manager approval. Cannot be self-approved under Policy P10.'
              : 'Authority threshold: Requires Procurement Manager or higher approval. Cannot be self-approved under Policy P10.'}
          </p>
        </div>

        {po.status === 'PENDING_APPROVAL' && isMaker && (
          <div className="rounded-card border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <strong>Policy P10 (Maker ≠ Checker):</strong> You are the creator of this purchase order. Self-approval is strictly forbidden. A different authorized manager must approve it.
          </div>
        )}
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-2 gap-4 rounded-card border border-rule bg-paper p-5 sm:grid-cols-4">
        <div>
          <span className="block text-xs font-medium text-ink-2">Supplier</span>
          <span className="font-medium text-ink">{po.supplierName || po.supplierId}</span>
        </div>
        <div>
          <span className="block text-xs font-medium text-ink-2">Warehouse</span>
          <span className="font-medium text-ink">{po.warehouseId}</span>
        </div>
        <div>
          <span className="block text-xs font-medium text-ink-2">Total Amount</span>
          <span className="font-heading text-lg font-bold text-accent">{formatVnd(po.totalAmountVnd)}</span>
        </div>
        <div>
          <span className="block text-xs font-medium text-ink-2">Approved By</span>
          <span className="font-medium text-ink">{po.approvedBy ? `${po.approvedBy}` : '—'}</span>
        </div>
      </div>

      {/* Lines Table */}
      <div className="rounded-card border border-rule bg-paper">
        <div className="border-b border-rule bg-paper-2 px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-ink">Order Lines (SC09 Inspection Tracking)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Ordered</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Line Total</th>
                <th className="px-4 py-3 text-right">Received (Passed)</th>
                <th className="px-4 py-3 text-right">Damaged</th>
                <th className="px-4 py-3 text-right">Short</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {po.lines.map((l, i) => (
                <tr key={i} className="hover:bg-paper-2">
                  <td className="px-4 py-3 font-medium text-ink">{l.skuId}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{l.orderedQty}</td>
                  <td className="px-4 py-3 text-right text-ink-2">{formatVnd(l.unitCostVnd)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{formatVnd(l.orderedQty * l.unitCostVnd)}</td>
                  <td className="px-4 py-3 text-right text-green-700 font-medium">{l.receivedQty || 0}</td>
                  <td className="px-4 py-3 text-right text-amber-700 font-medium">{l.damagedQty || 0}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">{l.shortQty || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons for Pending Approval */}
      {po.status === 'PENDING_APPROVAL' && (
        <div className="flex justify-end gap-3 rounded-card border border-rule bg-paper p-4">
          <button
            type="button"
            onClick={() => setShowRejectModal(true)}
            className="rounded-button border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Reject PO
          </button>
          <button
            type="button"
            disabled={Boolean(isMaker) || approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            className="rounded-button bg-accent px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approveMutation.isPending ? 'Approving...' : isMaker ? 'Self-Approval Blocked (P10)' : 'Approve Purchase Order'}
          </button>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-5 shadow-lg">
            <h3 className="font-heading text-lg font-semibold text-ink">Reject Purchase Order</h3>
            <p className="mt-1 text-xs text-ink-2">Please provide a reason for rejecting this purchase order.</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Budget exhausted, re-negotiating pricing with supplier"
              className="mt-3 block w-full rounded-control border border-rule-2 bg-paper p-3 text-sm text-ink"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-button border border-rule-2 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate(rejectReason)}
                className="rounded-button bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
