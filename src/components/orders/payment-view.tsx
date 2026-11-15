'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { describePayment, type PaymentTone } from '@/orders/order-state'
import { getOrder, orderKey, reportPaymentOutcome } from '@/orders/order-api'
import type { Order, SimulatorOutcome } from '@/types/order'

const POLL_MS = 3000

const TONE_BORDER: Record<PaymentTone, string> = {
  waiting: 'border-ink',
  verifying: 'border-ink',
  success: 'border-success',
  failed: 'border-error',
  closed: 'border-error',
  late: 'border-error',
}

const WAITING_ACTIONS: Array<{ outcome: SimulatorOutcome; label: string }> = [
  { outcome: 'CAPTURED', label: 'Pay successfully' },
  { outcome: 'FAILED', label: 'Payment fails' },
  { outcome: 'UNKNOWN', label: 'Result unknown' },
]

/** While the result is unknown there is nothing to pay: only what the provider could still report. */
const UNKNOWN_ACTIONS: Array<{ outcome: SimulatorOutcome; label: string }> = [
  { outcome: 'CAPTURED', label: 'Result arrives: paid' },
  { outcome: 'LATE', label: 'Late payment' },
]

const CLOSED_ACTIONS: Array<{ outcome: SimulatorOutcome; label: string }> = [
  { outcome: 'CAPTURED', label: 'Late payment' },
]

/** Payment page of one order: waiting, verifying (never pay again), paid, failed, closed or paid too late. */
export function PaymentView({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const order = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    refetchInterval: (query) =>
      query.state.data && describePayment(query.state.data).isPending ? POLL_MS : false,
  })
  const report = useMutation({
    mutationFn: (outcome: SimulatorOutcome) =>
      reportPaymentOutcome(order.data!.paymentAttemptId, outcome),
    onSuccess: (updated: Order) => {
      queryClient.setQueryData(orderKey(orderId), updated)
    },
  })
  const isConfirmed = order.data?.status === 'CONFIRMED'
  useEffect(() => {
    // A confirmed order empties the cart on the server.
    if (isConfirmed) void queryClient.invalidateQueries({ queryKey: ['cart'] })
  }, [isConfirmed, queryClient])

  if (order.isPending)
    return (
      <p role="status" className="mt-8 text-ink-2">
        Loading your order…
      </p>
    )
  if (order.isError)
    return (
      <div className="mt-6">
        <FormAlert message="We could not load this order. Please reload the page." />
      </div>
    )

  const view = describePayment(order.data)
  const actions =
    order.data.status === 'RESERVED'
      ? WAITING_ACTIONS
      : order.data.status === 'UNKNOWN_HOLD'
        ? UNKNOWN_ACTIONS
        : view.canSimulate
          ? CLOSED_ACTIONS
          : []

  return (
    <div className="mt-6 flex max-w-[40rem] flex-col gap-6">
      <section
        aria-labelledby="payment-heading"
        aria-busy={view.isPending}
        className={`border-t-4 bg-paper-2 px-5 py-5 ${TONE_BORDER[view.tone]}`}
      >
        <h2 id="payment-heading" className="text-xl">
          {view.title}
        </h2>
        <p role="status" className="mt-2 text-ink-2">
          {view.body}
        </p>
        <p className="font-label mt-3 text-sm text-muted">Order {order.data.orderId}</p>
        {(view.tone === 'failed' || view.tone === 'closed' || view.tone === 'late') && (
          <Link href="/cart" className="btn btn-secondary mt-4">
            Back to cart
          </Link>
        )}
        {view.tone === 'success' && (
          <Link
            href={`/account/orders/${encodeURIComponent(order.data.orderId)}?placed=1`}
            className="btn btn-primary mt-4"
          >
            View your order
          </Link>
        )}
      </section>

      {actions.length > 0 && (
        <section aria-labelledby="simulator-heading" className="border-t border-rule-2 pt-4">
          <h2 id="simulator-heading" className="font-label text-lg text-ink">
            Payment simulator
          </h2>
          <p className="mt-1 text-sm text-muted">
            Development gateway: choose what the payment provider reports. No real money moves.
          </p>
          {report.isError && (
            <div className="mt-3">
              <FormAlert message="We could not send that result. Please try again." />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {actions.map((action) => (
              <button
                key={action.outcome}
                type="button"
                disabled={report.isPending}
                onClick={() => report.mutate(action.outcome)}
                className="btn btn-secondary"
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
