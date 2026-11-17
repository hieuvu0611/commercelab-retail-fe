import { storefrontApi } from '@/services/api/clients'

export type PromoDiscountType = 'PERCENT' | 'FIXED_AMOUNT'
export type PromoSegment = 'ALL' | 'NEW_CUSTOMER' | 'VIP'
export type PromoStatus = 'ACTIVE' | 'PAUSED'

export interface PromotionCampaign {
  campaignId: string
  code: string
  name: string
  discountType: PromoDiscountType
  discountValue: number
  maxDiscountVnd: number
  minOrderVnd: number
  eligibleCategoryIds: string[]
  eligibleSkuIds: string[]
  customerSegment: PromoSegment
  autoApply: boolean
  stackable: boolean
  priority: number
  totalQuota: number
  reservedQuota: number
  consumedQuota: number
  availableQuota: number
  budgetVnd: number
  budgetReservedVnd: number
  budgetConsumedVnd: number
  budgetRemainingVnd: number
  perCustomerLimit: number
  startsAt?: string | null
  endsAt?: string | null
  status: PromoStatus
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface PromotionCampaignInput {
  code: string
  name: string
  discountType: PromoDiscountType
  discountValue: number
  maxDiscountVnd: number
  minOrderVnd: number
  eligibleCategoryIds: string[]
  eligibleSkuIds: string[]
  customerSegment: PromoSegment
  autoApply: boolean
  stackable: boolean
  priority: number
  totalQuota: number
  budgetVnd: number
  perCustomerLimit: number
  startsAt?: string | null
  endsAt?: string | null
  status: PromoStatus
}

export const PROMOTIONS_KEY = ['admin-promotions'] as const
export const ACTIVE_PROMOTIONS_KEY = ['active-promotions'] as const
const quiet = { skipUnauthorizedHandler: true } as const

export async function listActivePromotions(): Promise<PromotionCampaign[]> {
  const { data } = await storefrontApi.get<PromotionCampaign[]>('/promotions/active', quiet)
  return data ?? []
}

export async function listAdminPromotions(params?: {
  status?: PromoStatus | ''
  q?: string
}): Promise<PromotionCampaign[]> {
  const { data } = await storefrontApi.get<PromotionCampaign[]>('/admin/promotions', {
    params: {
      ...(params?.status && { status: params.status }),
      ...(params?.q && { q: params.q }),
    },
    ...quiet,
  })
  return data ?? []
}

export async function createPromotionCampaign(
  input: PromotionCampaignInput
): Promise<PromotionCampaign> {
  const { data } = await storefrontApi.post<PromotionCampaign>('/admin/promotions', input, quiet)
  return data!
}

export async function updatePromotionCampaign(
  campaignId: string,
  input: PromotionCampaignInput
): Promise<PromotionCampaign> {
  const { data } = await storefrontApi.put<PromotionCampaign>(
    `/admin/promotions/${encodeURIComponent(campaignId)}`,
    input,
    quiet
  )
  return data!
}
