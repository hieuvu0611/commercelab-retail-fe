import { storefrontApi } from '@/services/api/clients'
import type { VoucherCampaign, VoucherCampaignInput, VoucherQuery } from '@/types/voucher'
import { toCampaign } from './adapters'

// Marketing voucher campaign calls (MARKETING). Mutations skip the global 401 sign-out so a form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const
const itemPath = (code: string) => `/admin/vouchers/${encodeURIComponent(code)}`

export const VOUCHERS_KEY = ['admin-vouchers'] as const

export async function listCampaigns(query: VoucherQuery) {
  const { data, metadata } = await storefrontApi.get<unknown[]>('/admin/vouchers', {
    params: {
      ...(query.q && { q: query.q }),
      ...(query.status && { status: query.status }),
      page: query.page,
      limit: query.limit,
    },
  })
  return {
    items: (data ?? []).map(toCampaign),
    total: metadata?.total ?? data?.length ?? 0,
    pageCount: metadata?.pageCount ?? 1,
  }
}

export async function createCampaign(input: VoucherCampaignInput): Promise<VoucherCampaign> {
  return toCampaign((await storefrontApi.post<unknown>('/admin/vouchers', input, quiet)).data)
}

/** The code is the identity and cannot change; every other field is sent so the screen never relies on defaults. */
export async function updateCampaign(input: VoucherCampaignInput): Promise<VoucherCampaign> {
  const { code, ...rest } = input
  return toCampaign((await storefrontApi.put<unknown>(itemPath(code), rest, quiet)).data)
}
