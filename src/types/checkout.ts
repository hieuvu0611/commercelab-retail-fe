// Address book, voucher eligibility and quote API types (Phase 4). The shapes follow the backend task notes of
// P4-T02, P4-T03 and P4-T05; src/addresses/adapters.ts and src/checkout/adapters.ts map the raw responses onto them,
// so reconciling with the real services (P4-T10) happens in those files. Amounts are integer VND.

export const MAX_ADDRESSES = 10

/** A delivery address of the signed-in customer: GET /users/me/addresses. */
export interface Address {
  id: string
  recipient: string
  phone: string
  line1: string
  ward: string
  district: string
  province: string
  isDefault: boolean
}

export type AddressInput = Omit<Address, 'id'>

/** Reasons the voucher check gives for refusing a code (GET /vouchers/{code}/eligibility). */
export const VOUCHER_REASONS = [
  'VOUCHER_NOT_FOUND',
  'VOUCHER_NOT_ACTIVE',
  'VOUCHER_NOT_STARTED',
  'VOUCHER_EXPIRED',
  'VOUCHER_EXHAUSTED',
  'VOUCHER_LIMIT_REACHED',
] as const

export interface VoucherEligibility {
  code: string
  eligible: boolean
  /** Why the code is refused; empty when eligible. */
  reason: string
  discountPct: number
}

export interface QuoteLine {
  skuId: string
  skuName: string
  quantity: number
  unitPriceVnd: number
  lineSubtotalVnd: number
  /** This line's share of the voucher discount (largest-remainder allocation). */
  lineDiscountVnd: number
  lineNetPayableVnd: number
  allocatedUnitPaidVnd: number
}

export interface AppliedCampaign {
  campaignId: string
  code: string
  name: string
  discountVnd: number
}

/** A priced snapshot of the cart, valid until `expiresAt` (five minutes). */
export interface Quote {
  quoteId: string
  /** Fingerprint of lines, prices, voucher and totals: it changes when anything the customer accepted changes. */
  version: string
  addressId: string
  voucherCode: string | null
  discountPct: number
  subtotalVnd: number
  discountVnd: number
  shippingFeeVnd: number
  totalPayableVnd: number
  appliedCampaigns?: AppliedCampaign[]
  lines: QuoteLine[]
  /** ISO timestamp. */
  expiresAt: string
}
