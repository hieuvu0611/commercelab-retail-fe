'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import {
  createExchangeOrder,
  decideApproval,
  disburseRefund,
  getBackofficeReturn,
  listApprovals,
  receiveBackofficeReturn,
  rejectBackofficeReturn,
  requestRefundApproval,
  STAFF_APPROVALS_KEY,
  STAFF_RETURNS_KEY,
  staffReturnKey,
  submitQcBackofficeReturn,
} from '@/returns/backoffice-returns-api'
import { returnProblem, returnReasonLabel, returnStatusLabel } from '@/returns/return-state'
import type { ReturnReasonCode } from '@/types/returns'
import { RETURN_STAFF_ROLES } from './returns-admin'
import { StaffOnly } from './staff-only'

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function ReturnDetailAdmin({ rmaId }: { rmaId: string }) {
  return (
    <StaffOnly role={RETURN_STAFF_ROLES} what="manage return case">
      <ReturnWorkbench rmaId={rmaId} />
    </StaffOnly>
  )
}

function ReturnWorkbench({ rmaId }: { rmaId: string }) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''

  const [qcInputs, setQcInputs] = useState<Record<string, { passed: number; failed: number }>>({})
  const [rejectNote, setRejectNote] = useState('')
  const [approvalReason, setApprovalReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [feedback, setFeedback] = useState<string>()

  const rmaQuery = useQuery({
    queryKey: staffReturnKey(rmaId),
    queryFn: () => getBackofficeReturn(rmaId),
  })

  const approvalsQuery = useQuery({
    queryKey: STAFF_APPROVALS_KEY,
    queryFn: () => listApprovals(),
  })

  const rma = rmaQuery.data
  const pendingApproval = approvalsQuery.data?.find(
    (a) => a.rmaId === rmaId && a.status === 'PENDING'
  )
  const approvedRecord = approvalsQuery.data?.find(
    (a) => a.rmaId === rmaId && a.status === 'APPROVED'
  )

  const invalidate = (msg?: string) => {
    setProblem(undefined)
    if (msg) setFeedback(msg)
    void queryClient.invalidateQueries({ queryKey: staffReturnKey(rmaId) })
    void queryClient.invalidateQueries({ queryKey: STAFF_RETURNS_KEY })
    void queryClient.invalidateQueries({ queryKey: STAFF_APPROVALS_KEY })
  }

  const receiveMutation = useMutation({
    mutationFn: () => receiveBackofficeReturn(rmaId),
    onSuccess: () => invalidate('Parcel marked as RECEIVED by warehouse.'),
    onError: (err) => setProblem(returnProblem(err)),
  })

  const qcMutation = useMutation({
    mutationFn: () => {
      if (!rma) return Promise.reject(new Error('No RMA loaded'))
      const results = rma.lines.map((l) => {
        const rawPassed = qcInputs[l.skuId]?.passed ?? l.quantity
        const passedQuantity = Math.min(l.quantity, Math.max(0, Math.trunc(rawPassed)))
        const rawFailed = qcInputs[l.skuId]?.failed ?? l.quantity - passedQuantity
        const failedQuantity = Math.min(l.quantity, Math.max(0, Math.trunc(rawFailed)))
        return {
          skuId: l.skuId,
          passedQuantity,
          failedQuantity,
        }
      })
      const invalidLine = rma.lines.find((l, idx) => {
        const r = results[idx]
        return r.passedQuantity + r.failedQuantity !== l.quantity
      })
      if (invalidLine) {
        return Promise.reject(
          new Error(`Passed + Failed quantities must equal ${invalidLine.quantity} for ${invalidLine.skuId}`)
        )
      }
      return submitQcBackofficeReturn(rmaId, results)
    },
    onSuccess: () => invalidate('QC inspection saved and refund calculated (SC07).'),
    onError: (err) => setProblem(returnProblem(err)),
  })

  const refundMutation = useMutation({
    mutationFn: () => disburseRefund(rmaId),
    onSuccess: () => invalidate('Refund successfully disbursed via payment simulator (I03/SC08).'),
    onError: (err) => setProblem(returnProblem(err)),
  })

  const requestApprovalMutation = useMutation({
    mutationFn: () => requestRefundApproval(rmaId, approvalReason),
    onSuccess: () => {
      setShowApprovalModal(false)
      invalidate('High-value refund approval requested (Maker-Checker P10).')
    },
    onError: (err) => setProblem(returnProblem(err)),
  })

  const decideApprovalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) =>
      decideApproval(id, action, 'Verified by checker'),
    onSuccess: (_, vars) =>
      invalidate(`Approval request ${vars.action.toLowerCase()}d successfully.`),
    onError: (err) => setProblem(returnProblem(err)),
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectBackofficeReturn(rmaId, rejectNote),
    onSuccess: () => {
      setShowRejectModal(false)
      invalidate('Return request rejected and return ceiling released.')
    },
    onError: (err) => setProblem(returnProblem(err)),
  })

  const exchangeMutation = useMutation({
    mutationFn: () => createExchangeOrder(rmaId),
    onSuccess: (data) => invalidate(`Linked exchange order ${data.linkedOrderId} created (B06).`),
    onError: (err) => setProblem(returnProblem(err)),
  })

  if (rmaQuery.isLoading) {
    return <p role="status" className="mt-6 text-ink-2">Loading RMA details…</p>
  }

  if (rmaQuery.isError || !rma) {
    return (
      <div className="mt-6">
        <FormAlert message="Failed to load RMA record." />
        <Link href="/admin/returns" className="btn btn-secondary mt-3 inline-block">
          ← Back to Returns
        </Link>
      </div>
    )
  }

  const isHighValue = (rma.refund?.amountVnd ?? 0) > 500000
  const canDisburse =
    (rma.status === 'QC_PASSED' || rma.status === 'REFUND_PENDING') &&
    rma.refund !== null &&
    rma.refund.status !== 'COMPLETED' &&
    (!isHighValue || approvedRecord !== undefined)

  return (
    <div className="mt-6 flex max-w-[56rem] flex-col gap-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">RMA {rma.returnId}</h1>
            <span className="inline-flex rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink border border-rule-2">
              {returnStatusLabel(rma.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            Order:{' '}
            <Link href={`/admin/orders/${encodeURIComponent(rma.orderId)}`} className="text-accent underline">
              {rma.orderId}
            </Link>{' '}
            · Warehouse: <strong>{rma.warehouseId}</strong> · Customer: {rma.userId}
          </p>
          <p className="text-xs text-muted">
            Created: {dateFormat.format(new Date(rma.createdAt))} · Reason: {returnReasonLabel(rma.reason as ReturnReasonCode)}
          </p>
        </div>

        <Link href="/admin/returns" className="btn btn-secondary text-xs">
          ← Back to RMA Queue
        </Link>
      </div>

      {feedback && (
        <div className="border-l-4 border-success bg-paper-2 p-3 text-sm text-ink">
          {feedback}
        </div>
      )}

      {problem && (
        <div className="mt-2">
          <FormAlert message={problem} />
        </div>
      )}

      {rma.rejectionNote && (
        <div className="border-l-4 border-error bg-paper-2 p-4 text-sm text-ink">
          <strong>Rejection Notice:</strong> {rma.rejectionNote}
        </div>
      )}

      {rma.linkedOrderId && (
        <div className="border-l-4 border-accent bg-paper-2 p-4 text-sm text-ink">
          <strong>Linked Exchange Order (B06): </strong>
          <Link href={`/admin/orders/${encodeURIComponent(rma.linkedOrderId)}`} className="text-accent underline font-bold">
            {rma.linkedOrderId}
          </Link>
        </div>
      )}

      {/* Items Section */}
      <section aria-labelledby="rma-items-title" className="rounded-card border border-rule bg-paper p-5">
        <h2 id="rma-items-title" className="font-label text-lg text-ink">
          Return Line Items
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th className="py-2 pr-4 font-label">Item</th>
                <th className="py-2 pr-4 font-label">Requested</th>
                <th className="py-2 pr-4 font-label">Received</th>
                <th className="py-2 pr-4 font-label text-success">QC Pass</th>
                <th className="py-2 pr-4 font-label text-error">QC Fail</th>
                <th className="py-2 text-right font-label">Allocated Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rma.lines.map((l) => (
                <tr key={l.skuId}>
                  <td className="py-3 pr-4">
                    <p className="font-label text-ink">{l.skuName}</p>
                    <p className="text-xs text-muted">SKU {l.skuId}</p>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{l.quantity}</td>
                  <td className="py-3 pr-4 tabular-nums">{l.receivedQuantity}</td>
                  <td className="py-3 pr-4 tabular-nums font-semibold text-success">{l.passedQuantity}</td>
                  <td className="py-3 pr-4 tabular-nums font-semibold text-error">{l.failedQuantity}</td>
                  <td className="py-3 text-right tabular-nums">{formatVnd(l.allocatedUnitPaidVnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Refund Breakdown */}
      {rma.refund && (
        <section aria-labelledby="rma-refund-title" className="rounded-card border border-rule bg-paper p-5">
          <h2 id="rma-refund-title" className="font-label text-lg text-ink">
            Refund & Payout Calculation (SC08)
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-control bg-paper-2 p-3 text-sm">
              <span className="text-muted block text-xs">Goods Amount</span>
              <span className="font-bold text-ink text-base">{formatVnd(rma.refund.goodsVnd)}</span>
            </div>
            <div className="rounded-control bg-paper-2 p-3 text-sm">
              <span className="text-muted block text-xs">Shipping Fee Refund</span>
              <span className="font-bold text-ink text-base">{formatVnd(rma.refund.shippingVnd)}</span>
            </div>
            <div className="rounded-control bg-paper-2 p-3 text-sm border border-rule-2">
              <span className="text-muted block text-xs">Total Refund Payable</span>
              <span className="font-bold text-accent text-base">{formatVnd(rma.refund.amountVnd)}</span>
              <span className="block text-xs font-semibold text-ink mt-0.5">Status: {rma.refund.status}</span>
            </div>
          </div>
          {isHighValue && (
            <p className="mt-2 text-xs text-ink-2">
              ⚠️ Amount exceeds 500,000 VND limit. Requires Maker-Checker approval before payout.
            </p>
          )}
        </section>
      )}

      {/* Action Workbench */}
      <section aria-labelledby="rma-actions-title" className="rounded-card border border-rule bg-paper p-5">
        <h2 id="rma-actions-title" className="font-label text-lg text-ink">
          Operational Actions
        </h2>

        <div className="mt-4 flex flex-wrap gap-4">
          {/* Action 1: Receive Parcel */}
          {(rma.status === 'REQUESTED' || rma.status === 'APPROVED') && (
            <button
              type="button"
              disabled={receiveMutation.isPending}
              onClick={() => receiveMutation.mutate()}
              className="btn btn-primary"
            >
              {receiveMutation.isPending ? 'Receiving…' : '📦 Scan & Receive Parcel (Warehouse)'}
            </button>
          )}

          {/* Action 2: QC Inspection */}
          {rma.status === 'RECEIVED' && (
            <div className="w-full rounded-control bg-paper-2 p-4">
              <h3 className="font-label text-sm text-ink">Record QC Inspection Results (SC07)</h3>
              <p className="text-xs text-muted mt-1">
                Passed units return to Available stock; failed units stay Unsellable.
              </p>
              <div className="mt-3 space-y-3">
                {rma.lines.map((l) => {
                  const currentPassed = qcInputs[l.skuId]?.passed ?? l.quantity
                  const currentFailed = qcInputs[l.skuId]?.failed ?? 0
                  return (
                    <div key={l.skuId} className="flex items-center gap-4 text-sm">
                      <span className="w-48 font-label text-ink">{l.skuName} ({l.quantity} units)</span>
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <span>Passed:</span>
                        <input
                          type="number"
                          min={0}
                          max={l.quantity}
                          value={currentPassed}
                          onChange={(e) => {
                            const raw = parseInt(e.target.value, 10)
                            const p = Number.isNaN(raw) ? 0 : Math.min(l.quantity, Math.max(0, raw))
                            setQcInputs((prev) => ({
                              ...prev,
                              [l.skuId]: { passed: p, failed: l.quantity - p },
                            }))
                          }}
                          className="h-8 w-16 rounded border border-rule bg-paper px-2 text-center text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <span>Failed:</span>
                        <input
                          type="number"
                          min={0}
                          max={l.quantity}
                          value={currentFailed}
                          onChange={(e) => {
                            const raw = parseInt(e.target.value, 10)
                            const f = Number.isNaN(raw) ? 0 : Math.min(l.quantity, Math.max(0, raw))
                            setQcInputs((prev) => ({
                              ...prev,
                              [l.skuId]: { passed: l.quantity - f, failed: f },
                            }))
                          }}
                          className="h-8 w-16 rounded border border-rule bg-paper px-2 text-center text-sm"
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                disabled={qcMutation.isPending}
                onClick={() => qcMutation.mutate()}
                className="btn btn-primary mt-4"
              >
                {qcMutation.isPending ? 'Submitting QC…' : '✓ Submit QC Inspection'}
              </button>
            </div>
          )}

          {/* Action 3: Disburse Refund */}
          {canDisburse && (
            <button
              type="button"
              disabled={refundMutation.isPending}
              onClick={() => refundMutation.mutate()}
              className="btn btn-primary"
            >
              {refundMutation.isPending ? 'Disbursing…' : `💸 Disburse Refund (${formatVnd(rma.refund?.amountVnd ?? 0)})`}
            </button>
          )}

          {/* Action 4: Request Maker-Checker Approval */}
          {(rma.status === 'QC_PASSED' || rma.status === 'REFUND_PENDING') &&
            isHighValue &&
            !approvedRecord &&
            !pendingApproval && (
              <button
                type="button"
                onClick={() => setShowApprovalModal(true)}
                className="btn btn-secondary"
              >
                📝 Request High-Value Approval (&gt; 500k)
              </button>
            )}

          {/* Action 5: Create Exchange Order */}
          {rma.status === 'QC_PASSED' && !rma.linkedOrderId && (
            <button
              type="button"
              disabled={exchangeMutation.isPending}
              onClick={() => exchangeMutation.mutate()}
              className="btn btn-secondary"
            >
              {exchangeMutation.isPending ? 'Creating…' : '🔄 Create Linked Exchange Order (B06)'}
            </button>
          )}

          {/* Action 6: Reject RMA */}
          {(rma.status === 'REQUESTED' || rma.status === 'APPROVED') && (
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              className="btn btn-secondary text-error"
            >
              ✕ Reject Return Request
            </button>
          )}
        </div>

        {/* Checker Decision Box if Pending Approval exists */}
        {pendingApproval && (
          <div className="mt-4 rounded-card border-2 border-accent bg-paper-2 p-4">
            <h3 className="font-bold text-ink">Pending Approval: {pendingApproval.id}</h3>
            <p className="text-xs text-ink-2 mt-1">
              Maker: <strong>{pendingApproval.makerUserId}</strong> · Amount: {formatVnd(pendingApproval.amountVnd)} · Reason: {pendingApproval.reason}
            </p>
            {Boolean(currentUserId) && pendingApproval.makerUserId === currentUserId ? (
              <p className="mt-2 text-xs text-error font-semibold">
                ⚠️ You proposed this approval. Under Maker-Checker policy (P10), another staff member must review and approve it.
              </p>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={decideApprovalMutation.isPending}
                  onClick={() =>
                    decideApprovalMutation.mutate({ id: pendingApproval.id, action: 'APPROVE' })
                  }
                  className="btn btn-primary text-xs"
                >
                  ✓ Approve Refund Request
                </button>
                <button
                  type="button"
                  disabled={decideApprovalMutation.isPending}
                  onClick={() =>
                    decideApprovalMutation.mutate({ id: pendingApproval.id, action: 'REJECT' })
                  }
                  className="btn btn-secondary text-xs text-error"
                >
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Audit History */}
      <section aria-labelledby="rma-history-title" className="rounded-card border border-rule bg-paper p-5">
        <h2 id="rma-history-title" className="font-label text-lg text-ink">
          Audit Timeline
        </h2>
        <ol className="mt-3 flex flex-col border-l border-rule-2 pl-4 space-y-3">
          {rma.history.map((event, idx) => (
            <li key={idx} className="text-sm">
              <span className="font-semibold text-ink">{event.type}</span> by{' '}
              <span className="text-muted">{event.actor}</span>
              <p className="text-xs text-muted">{dateFormat.format(new Date(event.at))}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Reject Modal */}
      {showRejectModal && (
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">Reject Return Request</h3>
            <p className="text-xs text-muted mt-1">Please provide a clear justification for the rejection.</p>
            <textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Returned after policy expiration / damaged by customer"
              className="mt-3 w-full rounded border border-rule p-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending || !rejectNote.trim()}
                onClick={() => rejectMutation.mutate()}
                className="btn btn-primary text-sm bg-error text-white"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Approval Modal */}
      {showApprovalModal && (
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">Request High-Value Approval</h3>
            <p className="text-xs text-muted mt-1">
              Refund of {formatVnd(rma.refund?.amountVnd ?? 0)} exceeds 500,000 VND and requires checker sign-off.
            </p>
            <textarea
              rows={3}
              value={approvalReason}
              onChange={(e) => setApprovalReason(e.target.value)}
              placeholder="e.g. Verified defective zipper with photos, full refund recommended"
              className="mt-3 w-full rounded border border-rule p-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={requestApprovalMutation.isPending}
                onClick={() => requestApprovalMutation.mutate()}
                className="btn btn-primary text-sm"
              >
                {requestApprovalMutation.isPending ? 'Submitting…' : 'Submit Approval Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
