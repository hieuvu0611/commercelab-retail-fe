'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { trackingKey } from '@/fulfillment/tracking-api'
import { orderDetailKey } from '@/orders/order-api'
import { forgetReturnKey, keyForReturn } from '@/returns/idempotency'
import { orderReturnsKey, requestReturn } from '@/returns/returns-api'
import { returnProblem } from '@/returns/return-state'
import { RETURN_REASONS, type ReturnReasonCode } from '@/types/returns'

export interface ReturnableLineItem {
  skuId: string
  skuName: string
  maxQuantity: number
  allocatedUnitPaidVnd: number
}

interface RequestReturnDialogProps {
  orderId: string
  lines: ReturnableLineItem[]
  parcelIndex?: number
  shippingFeeVnd: number
  isOpen: boolean
  onClose: () => void
}

export function RequestReturnDialog({
  orderId,
  lines,
  parcelIndex,
  shippingFeeVnd,
  isOpen,
  onClose,
}: RequestReturnDialogProps) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState<ReturnReasonCode>('CHANGED_MIND')
  const [selectedLines, setSelectedLines] = useState<Record<string, number>>({})
  const [customerNote, setCustomerNote] = useState('')
  const [problem, setProblem] = useState<string>()

  // Calculate items to submit
  const activeLines = lines.filter((l) => (selectedLines[l.skuId] ?? 0) > 0)
  const estimatedGoodsVnd = activeLines.reduce(
    (sum, l) => sum + (selectedLines[l.skuId] ?? 0) * l.allocatedUnitPaidVnd,
    0
  )

  const selectedReasonObj = RETURN_REASONS.find((r) => r.code === reason)
  const isSellerError = selectedReasonObj?.isSellerError ?? false

  const returnMutation = useMutation({
    mutationFn: () => {
      const payloadLines = activeLines.map((l) => ({
        skuId: l.skuId,
        quantity: selectedLines[l.skuId],
      }))
      return requestReturn(
        {
          orderId,
          ...(parcelIndex !== undefined && { parcelIndex }),
          reason,
          lines: payloadLines,
          notes: customerNote.trim() || undefined,
        },
        keyForReturn(orderId)
      )
    },
    onSuccess: () => {
      forgetReturnKey(orderId)
      setProblem(undefined)
      onClose()
      void queryClient.invalidateQueries({ queryKey: orderReturnsKey(orderId) })
      void queryClient.invalidateQueries({ queryKey: trackingKey(orderId) })
      void queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) })
    },
    onError: (err) => {
      setProblem(returnProblem(err))
    },
  })

  if (!isOpen) return null

  const handleQuantityChange = (skuId: string, qty: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, qty))
    setSelectedLines((prev) => ({
      ...prev,
      [skuId]: clamped,
    }))
  }

  const handleToggle = (skuId: string, max: number) => {
    setSelectedLines((prev) => {
      const current = prev[skuId] ?? 0
      return {
        ...prev,
        [skuId]: current > 0 ? 0 : Math.min(1, max),
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeLines.length === 0) {
      setProblem('Please select at least one item to return.')
      return
    }
    setProblem(undefined)
    returnMutation.mutate()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-paper p-6 shadow-xl">
        <h2 id="return-dialog-title" className="text-xl font-bold text-ink">
          Request Return for Order {orderId}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Select items you want to return and specify the reason. Return window is 7 days from delivery.
        </p>

        {problem && (
          <div className="mt-3">
            <FormAlert message={problem} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="return-reason" className="font-label block text-sm text-ink">
              Reason for Return
            </label>
            <select
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReasonCode)}
              className="mt-1 h-11 w-full rounded-control border border-rule-2 bg-paper px-3 text-ink"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="border-t border-rule pt-3">
            <legend className="font-label text-sm text-ink">Select Items to Return</legend>
            <div className="mt-2 divide-y divide-rule">
              {lines.map((line) => {
                const qty = selectedLines[line.skuId] ?? 0
                const isSelected = qty > 0
                return (
                  <div key={line.skuId} className="flex items-center justify-between py-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`select-${line.skuId}`}
                        checked={isSelected}
                        onChange={() => handleToggle(line.skuId, line.maxQuantity)}
                        className="mt-1 size-4 rounded border-rule-2"
                      />
                      <div>
                        <label
                          htmlFor={`select-${line.skuId}`}
                          className="font-label block text-sm text-ink cursor-pointer"
                        >
                          {line.skuName}
                        </label>
                        <p className="text-xs text-muted">
                          SKU {line.skuId} · Paid {formatVnd(line.allocatedUnitPaidVnd)}/ea (Max returnable: {line.maxQuantity})
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-1">
                        <label htmlFor={`qty-${line.skuId}`} className="sr-only">
                          Quantity for {line.skuName}
                        </label>
                        <input
                          type="number"
                          id={`qty-${line.skuId}`}
                          min={1}
                          max={line.maxQuantity}
                          value={qty}
                          onChange={(e) =>
                            handleQuantityChange(
                              line.skuId,
                              parseInt(e.target.value, 10) || 0,
                              line.maxQuantity
                            )
                          }
                          className="h-9 w-16 rounded border border-rule-2 bg-paper px-2 text-center text-sm text-ink"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="customer-note" className="font-label block text-sm text-ink">
              Additional Details (Optional)
            </label>
            <textarea
              id="customer-note"
              rows={2}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="e.g. Broken zipper, wrong color sent"
              className="mt-1 w-full rounded-control border border-rule-2 bg-paper p-2.5 text-sm text-ink"
            />
          </div>

          <div className="rounded-control bg-paper-2 p-3 text-sm">
            <div className="flex justify-between font-label text-ink">
              <span>Estimated Refund (Goods):</span>
              <span>{formatVnd(estimatedGoodsVnd)}</span>
            </div>
            {isSellerError ? (
              <p className="mt-1 text-xs text-ink-2">
                Since this return is due to seller error, original shipping fee ({formatVnd(shippingFeeVnd)}) is eligible for refund upon warehouse QC verification (P11).
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Per policy P09, shipping fee is non-refundable for change of mind returns.
              </p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              disabled={returnMutation.isPending}
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={returnMutation.isPending || activeLines.length === 0}
              className="btn btn-primary"
            >
              {returnMutation.isPending ? 'Submitting…' : 'Submit Return Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
