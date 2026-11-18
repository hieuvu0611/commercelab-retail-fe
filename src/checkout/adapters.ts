import type { AppliedCampaign, Quote, QuoteLine, VoucherEligibility } from '@/types/checkout'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

function toQuoteLine(raw: unknown): QuoteLine {
  const line = asRaw(raw)
  const quantity = whole(line.quantity)
  const unitPriceVnd = whole(line.unitPriceVnd)
  const lineSubtotalVnd = whole(line.lineSubtotalVnd ?? unitPriceVnd * quantity)
  const lineDiscountVnd = whole(line.lineDiscountVnd)
  return {
    skuId: text(line.skuId),
    skuName: text(line.skuName) || text(line.skuId),
    quantity,
    unitPriceVnd,
    lineSubtotalVnd,
    lineDiscountVnd,
    lineNetPayableVnd: whole(line.lineNetPayableVnd ?? lineSubtotalVnd - lineDiscountVnd),
    allocatedUnitPaidVnd: whole(line.allocatedUnitPaidVnd),
  }
}

function toAppliedCampaign(raw: unknown): AppliedCampaign | null {
  const c = asRaw(raw)
  const campaignId = text(c.campaignId)
  if (!campaignId) return null
  return {
    campaignId,
    code: text(c.code),
    name: text(c.name) || text(c.code),
    discountVnd: whole(c.discountVnd),
  }
}

export function toQuote(raw: unknown): Quote {
  const quote = asRaw(raw)
  const appliedCampaigns = (Array.isArray(quote.appliedCampaigns) ? quote.appliedCampaigns : [])
    .map(toAppliedCampaign)
    .filter((c): c is AppliedCampaign => c !== null)
  return {
    quoteId: text(quote.quoteId),
    version: text(quote.version),
    addressId: text(quote.addressId),
    voucherCode: text(quote.voucherCode) || null,
    discountPct: whole(quote.discountPct),
    subtotalVnd: whole(quote.subtotalVnd),
    discountVnd: whole(quote.discountVnd),
    shippingFeeVnd: whole(quote.shippingFeeVnd),
    totalPayableVnd: whole(quote.totalPayableVnd),
    ...(appliedCampaigns.length > 0 && { appliedCampaigns }),
    lines: (Array.isArray(quote.lines) ? quote.lines : []).map(toQuoteLine),
    expiresAt: text(quote.expiresAt),
  }
}

export function toEligibility(raw: unknown): VoucherEligibility {
  const result = asRaw(raw)
  return {
    code: text(result.code),
    eligible: result.eligible === true,
    reason: text(result.reason),
    discountPct: whole(result.discountPct),
  }
}
