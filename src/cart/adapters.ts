import type { Cart, CartLine, CartMergeResult } from '@/types/cart'

// Maps raw cart responses onto the types in src/types/cart.ts. The field names follow the quote contract of the
// pricing service (skuName, unitPriceVnd, ...) and accept the likely alternatives, because the cart service
// contract is confirmed in P4-T10.

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const whole = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback

function attributesOf(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRaw(value)).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )
}

export function toCartLine(raw: unknown): CartLine {
  const line = asRaw(raw)
  const quantity = whole(line.quantity)
  const unitPriceVnd = whole(line.unitPriceVnd)
  return {
    skuId: text(line.skuId),
    quantity,
    name: text(line.skuName ?? line.name ?? line.productName, text(line.skuId)),
    slug: text(line.slug ?? line.productSlug) || null,
    imageUrl: text(line.imageUrl) || null,
    attributes: attributesOf(line.attributes),
    unitPriceVnd,
    lineTotalVnd: whole(line.lineTotalVnd ?? line.lineSubtotalVnd, unitPriceVnd * quantity),
    isAvailable: line.isAvailable !== false && line.available !== false,
  }
}

export function toCart(raw: unknown): Cart {
  const data = asRaw(raw)
  const rawLines = data.lines ?? data.items
  const lines = (Array.isArray(rawLines) ? rawLines : []).map(toCartLine)
  return {
    lines,
    subtotalVnd: whole(
      data.subtotalVnd,
      lines.reduce((sum, line) => sum + line.lineTotalVnd, 0)
    ),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  }
}

export function toMergeResult(raw: unknown): CartMergeResult {
  const data = asRaw(raw)
  const skipped = data.skipped ?? data.rejected
  return {
    skipped: (Array.isArray(skipped) ? skipped : []).map((entry) => {
      const item = asRaw(entry)
      return { skuId: text(item.skuId), reason: text(item.reason, 'UNAVAILABLE') }
    }),
  }
}
