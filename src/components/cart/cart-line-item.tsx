'use client'

import Link from 'next/link'
import { formatVnd } from '@/catalog/money'
import type { CartLine } from '@/types/cart'
import { QuantityStepper } from './quantity-stepper'

/** One cart line, shared by the mini cart drawer and the cart page. */
export function CartLineItem({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine
  onQuantityChange: (skuId: string, quantity: number) => void
  onRemove: (skuId: string) => void
}) {
  const variant = Object.values(line.attributes).join(' / ')
  return (
    <li className="flex gap-4 border-b border-rule py-4">
      <div className="size-20 shrink-0 bg-paper-2">
        {line.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-label text-ink">
          {line.slug ? (
            <Link href={`/p/${line.slug}`} className="no-underline hover:underline">
              {line.name}
            </Link>
          ) : (
            line.name
          )}
        </p>
        {variant && <p className="text-sm text-ink-2">{variant}</p>}
        <p className="text-sm text-muted">
          {formatVnd(line.unitPriceVnd)} each · SKU {line.skuId}
        </p>
        {line.isAvailable ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <QuantityStepper
              label={line.name}
              value={line.quantity}
              onChange={(quantity) => onQuantityChange(line.skuId, quantity)}
            />
            <button
              type="button"
              aria-label={`Remove ${line.name} from the cart`}
              onClick={() => onRemove(line.skuId)}
              className="font-label min-h-11 text-sm underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p role="status" className="text-sm text-error">
              No longer available. It will not be included in your order.
            </p>
            <button
              type="button"
              aria-label={`Remove ${line.name} from the cart`}
              onClick={() => onRemove(line.skuId)}
              className="font-label min-h-11 text-sm underline"
            >
              Remove
            </button>
          </div>
        )}
      </div>
      <p className="font-label shrink-0 text-ink">{formatVnd(line.lineTotalVnd)}</p>
    </li>
  )
}
