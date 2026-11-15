// Voucher campaign types for the marketing screens (P4-T04). vouchers/adapters.ts maps the raw responses onto them,
// so reconciling with the real order service (P4-T10) happens in that file.

export type CampaignStatus = 'ACTIVE' | 'PAUSED'

export interface VoucherCampaign {
  code: string
  name: string
  /** Whole percent, 1 to 100. Applies to goods only, never to shipping. */
  discountPct: number
  totalQuota: number
  availableQuota: number
  reservedQuota: number
  consumedQuota: number
  perCustomerLimit: number
  /** ISO timestamps; null means open. */
  startsAt: string | null
  endsAt: string | null
  status: CampaignStatus
}

/** What the create and edit forms send. */
export interface VoucherCampaignInput {
  code: string
  name: string
  discountPct: number
  totalQuota: number
  perCustomerLimit: number
  startsAt: string | null
  endsAt: string | null
  status: CampaignStatus
}

export interface VoucherQuery {
  q: string
  status: CampaignStatus | ''
  page: number
  limit: number
}
