'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { formatVnd } from '@/catalog/money'
import { listOrderReturns, orderReturnsKey } from '@/returns/returns-api'
import { returnReasonLabel, returnStatusLabel } from '@/returns/return-state'

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function OrderReturnsList({ orderId }: { orderId: string }) {
  const { data: returns, isLoading } = useQuery({
    queryKey: orderReturnsKey(orderId),
    queryFn: () => listOrderReturns(orderId),
  })

  if (isLoading || !returns || returns.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="order-returns-heading" className="mt-6 border-t border-rule pt-6">
      <h3 id="order-returns-heading" className="text-xl font-bold text-ink">
        Returns & Exchanges
      </h3>
      <div className="mt-4 flex flex-col gap-4">
        {returns.map((rma) => (
          <div
            key={rma.returnId}
            className="rounded-card border border-rule-2 bg-paper p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link
                  href={`/account/returns/${encodeURIComponent(rma.returnId)}`}
                  className="font-label text-base text-ink hover:underline"
                >
                  {rma.returnId}
                </Link>
                <p className="text-xs text-muted">
                  Requested {dateFormat.format(new Date(rma.createdAt))}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink">
                {returnStatusLabel(rma.status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-ink-2">
              <span className="font-label text-ink">Reason: </span>
              {returnReasonLabel(rma.reason)}
            </p>

            <ul className="mt-2 divide-y divide-rule text-sm">
              {rma.lines.map((line) => (
                <li key={line.skuId} className="flex justify-between py-1 text-ink-2">
                  <span>
                    {line.skuName} (SKU {line.skuId}) × {line.quantity}
                  </span>
                  <span>{formatVnd(line.allocatedUnitPaidVnd * line.quantity)}</span>
                </li>
              ))}
            </ul>

            {rma.refund && (
              <div className="mt-3 flex justify-between border-t border-rule pt-2 text-sm font-label text-ink">
                <span>Refund ({rma.refund.status}):</span>
                <span>{formatVnd(rma.refund.amountVnd)}</span>
              </div>
            )}

            {rma.rejectionNote && (
              <p className="mt-2 text-xs text-error">
                Rejection reason: {rma.rejectionNote}
              </p>
            )}

            <div className="mt-3">
              <Link
                href={`/account/returns/${encodeURIComponent(rma.returnId)}`}
                className="text-xs font-label text-ink underline"
              >
                View RMA Details →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
