// The quote rules of the pricing service, used by the in-app mock backend only (the real service does this on the
// server): one voucher, shipping excluded from the discount, integer allocation by largest remainder with ties
// broken by ascending SKU id (docs/00 section 3, P08, SC01, SC10).

export const STANDARD_SHIPPING_VND = 30000
export const FREE_SHIPPING_THRESHOLD_VND = 1000000

export interface PricedLine {
  skuId: string
  skuName: string
  quantity: number
  unitPriceVnd: number
}

export interface AllocatedLine extends PricedLine {
  lineSubtotalVnd: number
  lineDiscountVnd: number
  lineNetPayableVnd: number
  allocatedUnitPaidVnd: number
}

export interface QuoteTotals {
  lines: AllocatedLine[]
  subtotalVnd: number
  discountVnd: number
  shippingFeeVnd: number
  totalPayableVnd: number
}

export function calculateQuote(input: readonly PricedLine[], discountPct: number): QuoteTotals {
  const sorted = [...input].sort((a, b) => (a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : 0))
  const subtotalVnd = sorted.reduce((sum, line) => sum + line.quantity * line.unitPriceVnd, 0)
  const discountVnd = Math.floor((subtotalVnd * discountPct) / 100)

  const shares = sorted.map((line) => {
    const lineSubtotalVnd = line.quantity * line.unitPriceVnd
    const exact = subtotalVnd > 0 ? discountVnd * lineSubtotalVnd : 0
    return {
      line,
      lineSubtotalVnd,
      base: subtotalVnd > 0 ? Math.floor(exact / subtotalVnd) : 0,
      remainder: subtotalVnd > 0 ? exact % subtotalVnd : 0,
    }
  })
  let leftover = discountVnd - shares.reduce((sum, share) => sum + share.base, 0)
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const extra = new Map<number, number>()
  for (const { index } of byRemainder) {
    if (leftover <= 0) break
    extra.set(index, 1)
    leftover -= 1
  }

  const lines = shares.map((share, index): AllocatedLine => {
    const lineDiscountVnd = share.base + (extra.get(index) ?? 0)
    const lineNetPayableVnd = share.lineSubtotalVnd - lineDiscountVnd
    return {
      ...share.line,
      lineSubtotalVnd: share.lineSubtotalVnd,
      lineDiscountVnd,
      lineNetPayableVnd,
      allocatedUnitPaidVnd: Math.floor(lineNetPayableVnd / share.line.quantity),
    }
  })
  const netMerchandise = subtotalVnd - discountVnd
  const shippingFeeVnd = netMerchandise >= FREE_SHIPPING_THRESHOLD_VND ? 0 : STANDARD_SHIPPING_VND
  return {
    lines,
    subtotalVnd,
    discountVnd,
    shippingFeeVnd,
    totalPayableVnd: netMerchandise + shippingFeeVnd,
  }
}
