'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { getReturn, returnKey } from '@/returns/returns-api'
import { returnReasonLabel, returnStatusLabel } from '@/returns/return-state'

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function ReturnDetailView({ returnId }: { returnId: string }) {
  const { data: rma, isLoading, isError } = useQuery({
    queryKey: returnKey(returnId),
    queryFn: () => getReturn(returnId),
  })

  if (isLoading) {
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading return details…
      </p>
    )
  }

  if (isError || !rma) {
    return (
      <div className="mt-6">
        <FormAlert message="Unable to load return details. Please try again." />
        <Link href="/account/orders" className="btn btn-secondary mt-4 inline-block">
          Back to Orders
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-6 flex max-w-[48rem] flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold text-ink">Return {rma.returnId}</h2>
          <span className="inline-flex rounded-full bg-paper-2 px-3 py-1 text-sm font-semibold text-ink">
            {returnStatusLabel(rma.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          For Order{' '}
          <Link
            href={`/account/orders/${encodeURIComponent(rma.orderId)}`}
            className="font-label text-ink underline"
          >
            {rma.orderId}
          </Link>{' '}
          · Requested on {dateFormat.format(new Date(rma.createdAt))}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-label text-ink">Reason: </span>
          {returnReasonLabel(rma.reason)}
        </p>
      </div>

      {rma.rejectionNote && (
        <div className="border-l-4 border-error bg-paper-2 p-4 text-sm text-ink">
          <p className="font-bold">Return Request Rejected</p>
          <p className="mt-1">{rma.rejectionNote}</p>
        </div>
      )}

      {/* Items table */}
      <section aria-labelledby="items-heading" className="border-t border-rule pt-4">
        <h3 id="items-heading" className="text-lg font-bold text-ink">
          Returned Items
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th className="py-2 pr-4 font-label">Item</th>
                <th className="py-2 pr-4 font-label">Requested</th>
                <th className="py-2 pr-4 font-label">Received</th>
                <th className="py-2 pr-4 font-label">QC Passed</th>
                <th className="py-2 pr-4 font-label">QC Failed</th>
                <th className="py-2 text-right font-label">Unit Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rma.lines.map((line) => (
                <tr key={line.skuId}>
                  <td className="py-3 pr-4">
                    <p className="font-label text-ink">{line.skuName}</p>
                    <p className="text-xs text-muted">SKU {line.skuId}</p>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{line.quantity}</td>
                  <td className="py-3 pr-4 tabular-nums">{line.receivedQuantity}</td>
                  <td className="py-3 pr-4 tabular-nums text-success">{line.passedQuantity}</td>
                  <td className="py-3 pr-4 tabular-nums text-error">{line.failedQuantity}</td>
                  <td className="py-3 text-right tabular-nums">
                    {formatVnd(line.allocatedUnitPaidVnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Refund breakdown */}
      {rma.refund && (
        <section aria-labelledby="refund-heading" className="border-t border-rule pt-4">
          <h3 id="refund-heading" className="text-lg font-bold text-ink">
            Refund Summary
          </h3>
          <dl className="mt-3 flex max-w-[24rem] flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Goods Refund</dt>
              <dd className="tabular-nums">{formatVnd(rma.refund.goodsVnd)}</dd>
            </div>
            {rma.refund.shippingVnd > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-2">Shipping Refund</dt>
                <dd className="tabular-nums">{formatVnd(rma.refund.shippingVnd)}</dd>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-rule-2 pt-2 text-base font-bold text-ink">
              <dt>Total Refund</dt>
              <dd className="tabular-nums">{formatVnd(rma.refund.amountVnd)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <dt>Status</dt>
              <dd className="font-semibold text-ink">{rma.refund.status}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* Return Instructions / Next Steps */}
      <section className="rounded-card bg-paper-2 p-4 text-sm text-ink-2">
        <h4 className="font-bold text-ink">Return Process & Instructions</h4>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Pack items securely in original packaging if possible.</li>
          <li>Attach RMA ID <strong>{rma.returnId}</strong> to the package exterior.</li>
          <li>Our warehouse will scan and inspect the returned goods upon arrival.</li>
          <li>Refunds will be credited to your original payment method once QC is complete.</li>
        </ul>
      </section>

      <div>
        <Link
          href={`/account/orders/${encodeURIComponent(rma.orderId)}`}
          className="btn btn-secondary inline-block"
        >
          ← Back to Order {rma.orderId}
        </Link>
      </div>
    </div>
  )
}
