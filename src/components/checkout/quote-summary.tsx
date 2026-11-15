'use client'

import { formatVnd } from '@/catalog/money'
import { formatCountdown } from '@/checkout/quote-state'
import type { Quote } from '@/types/checkout'

/** The priced breakdown: every line with its share of the voucher, then goods, discount, shipping and total. */
export function QuoteSummary({ quote, secondsLeft }: { quote: Quote; secondsLeft: number }) {
  const isExpired = secondsLeft === 0
  return (
    <section aria-labelledby="quote-heading" className="border-t-4 border-ink bg-paper-2 px-5 py-5">
      <h2 id="quote-heading" className="text-xl">
        Your quote
      </h2>
      <p
        role="timer"
        aria-live="off"
        className={`font-label mt-1 text-sm ${isExpired ? 'text-error' : 'text-ink-2'}`}
      >
        {isExpired ? 'Expired' : `Valid for ${formatCountdown(secondsLeft)}`}
      </p>

      <ul aria-label="Quote lines" className="mt-4 divide-y divide-rule">
        {quote.lines.map((line) => (
          <li key={line.skuId} className="py-3 text-sm">
            <p className="font-label text-ink">{line.skuName}</p>
            <p className="flex justify-between text-ink-2">
              <span>
                {line.quantity} × {formatVnd(line.unitPriceVnd)}
              </span>
              <span>{formatVnd(line.lineSubtotalVnd)}</span>
            </p>
            {line.lineDiscountVnd > 0 && (
              <p className="flex justify-between text-ink-2">
                <span>Voucher share</span>
                <span>−{formatVnd(line.lineDiscountVnd)}</span>
              </p>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Goods</dt>
          <dd>{formatVnd(quote.subtotalVnd)}</dd>
        </div>
        {quote.discountVnd > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-2">Voucher {quote.voucherCode}</dt>
            <dd>−{formatVnd(quote.discountVnd)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-2">Shipping</dt>
          <dd>{quote.shippingFeeVnd === 0 ? 'Free' : formatVnd(quote.shippingFeeVnd)}</dd>
        </div>
        <div className="font-label mt-2 flex justify-between border-t border-rule-2 pt-3 text-lg text-ink">
          <dt>Total</dt>
          <dd aria-live="polite">{formatVnd(quote.totalPayableVnd)}</dd>
        </div>
      </dl>
    </section>
  )
}
