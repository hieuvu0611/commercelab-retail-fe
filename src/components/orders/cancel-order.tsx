'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { ConfirmDialog } from '@/components/commons/confirm-dialog'
import { trackingKey } from '@/fulfillment/tracking-api'
import { keyForCancel } from '@/orders/idempotency'
import { ORDERS_KEY, cancelOrder, orderDetailKey } from '@/orders/order-api'
import { cancelProblem } from '@/orders/order-state'
import type { OrderDetail } from '@/types/order'
import { CANCEL_REASONS, type CancelReasonCode } from '@/types/cancellation'

/**
 * "Cancel order" with a confirmation that asks for a reason. The same order always sends the same Idempotency-Key and the
 * confirm button is disabled while the request runs, so a double click or a retry cancels (and refunds) once.
 */
export function CancelOrder({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState<CancelReasonCode | ''>('')
  const [hint, setHint] = useState<string>()
  const [problem, setProblem] = useState<string>()

  const cancel = useMutation({
    mutationFn: (code: CancelReasonCode) => cancelOrder(orderId, code, keyForCancel(orderId)),
    onSuccess: (updated) => {
      setProblem(undefined)
      setIsOpen(false)
      // The cancel answer is short (status and refund only): lay it over the order on screen.
      queryClient.setQueryData<OrderDetail>(
        orderDetailKey(orderId),
        (current) =>
          current && {
            ...current,
            status: updated.status,
            paymentStatus: updated.paymentStatus,
            cancellation: updated.cancellation,
            refund: updated.refund,
          }
      )
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
      void queryClient.invalidateQueries({ queryKey: trackingKey(orderId) })
    },
    onError: (error) => {
      setProblem(cancelProblem(error))
      setIsOpen(false)
      void queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) })
    },
  })

  const confirm = () => {
    if (cancel.isPending) return
    if (!reason) return setHint('Choose a reason before cancelling.')
    cancel.mutate(reason)
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          setProblem(undefined)
          setHint(undefined)
          setIsOpen(true)
        }}
      >
        Cancel order
      </button>
      <div className="mt-3 max-w-[40rem]">
        <FormAlert message={problem} />
      </div>
      {isOpen && (
        <ConfirmDialog
          title={`Cancel order ${orderId}?`}
          confirmLabel="Yes, cancel order"
          cancelLabel="Keep order"
          isBusy={cancel.isPending}
          onConfirm={confirm}
          onCancel={() => setIsOpen(false)}
        >
          <p>
            If your parcel is already being packed we first ask the warehouse to stop it, and the
            order stays open until they confirm. Money you paid is refunded.
          </p>
          <label htmlFor="cancel-reason" className="font-label mt-4 block text-sm text-ink">
            Reason
          </label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as CancelReasonCode | '')
              setHint(undefined)
            }}
            className="mt-1 h-11 w-full rounded-control border border-rule-2 bg-paper px-3 text-ink"
          >
            <option value="">Choose a reason</option>
            {CANCEL_REASONS.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
          <div className="mt-3">
            <FormAlert message={hint} />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
