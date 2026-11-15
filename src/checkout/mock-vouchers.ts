/** Voucher campaigns of the in-app mock backend: the single source of rules and quota (decision D-06). */

export type CampaignStatus = 'ACTIVE' | 'PAUSED'

export interface MockCampaign {
  code: string
  name: string
  discountPct: number
  totalQuota: number
  reservedQuota: number
  consumedQuota: number
  perCustomerLimit: number
  /** ISO timestamps; null means open. */
  startsAt: string | null
  endsAt: string | null
  status: CampaignStatus
  createdAt: string
  updatedAt: string
}

export interface MockVoucherState {
  campaigns: Map<string, MockCampaign>
  /** Uses per voucher code and user id (written by ordering in Phase 5, read by the eligibility check). */
  usages: Map<string, Map<string, number>>
}

const SEED_AT = '2026-10-01T09:00:00.000Z'

const seed = (
  code: string,
  name: string,
  totalQuota: number,
  consumedQuota = 0
): [string, MockCampaign] => [
  code,
  {
    code,
    name,
    discountPct: 10,
    totalQuota,
    reservedQuota: 0,
    consumedQuota,
    perCustomerLimit: 1,
    startsAt: null,
    endsAt: null,
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
]

export const createMockVoucherState = (): MockVoucherState => ({
  campaigns: new Map([
    seed('WELCOME10', 'Welcome 10% off', 100),
    // One use left, for the last-voucher scenario (SC10).
    seed('LASTONE10', 'Last voucher scenario', 1),
    // Fully used, to show the exhausted message.
    seed('SOLDOUT10', 'Fully used campaign', 5, 5),
  ]),
  usages: new Map(),
})

const globalForVouchers = globalThis as unknown as { __mockVoucherState?: MockVoucherState }

export function getMockVoucherState(): MockVoucherState {
  globalForVouchers.__mockVoucherState ??= createMockVoucherState()
  return globalForVouchers.__mockVoucherState
}

export const normalizeCode = (code: string): string => code.trim().toUpperCase()

export interface EligibilityResult {
  code: string
  eligible: boolean
  reason: string
  discountPct: number
}

/** Whether `userId` could use the code at `nowMs`. Reads only: nothing is reserved and no counts are exposed. */
export function checkEligibility(
  state: MockVoucherState,
  rawCode: string,
  userId: string,
  nowMs: number
): EligibilityResult {
  const code = normalizeCode(rawCode)
  const campaign = state.campaigns.get(code)
  const refuse = (reason: string): EligibilityResult => ({
    code,
    eligible: false,
    reason,
    discountPct: 0,
  })
  if (!campaign) return refuse('VOUCHER_NOT_FOUND')
  if (campaign.status !== 'ACTIVE') return refuse('VOUCHER_NOT_ACTIVE')
  if (campaign.startsAt && Date.parse(campaign.startsAt) > nowMs)
    return refuse('VOUCHER_NOT_STARTED')
  if (campaign.endsAt && Date.parse(campaign.endsAt) <= nowMs) return refuse('VOUCHER_EXPIRED')
  if (campaign.reservedQuota + campaign.consumedQuota >= campaign.totalQuota)
    return refuse('VOUCHER_EXHAUSTED')
  if ((state.usages.get(code)?.get(userId) ?? 0) >= campaign.perCustomerLimit)
    return refuse('VOUCHER_LIMIT_REACHED')
  return { code, eligible: true, reason: '', discountPct: campaign.discountPct }
}
