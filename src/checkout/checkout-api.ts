import { storefrontApi } from '@/services/api/clients'
import type { Quote, VoucherEligibility } from '@/types/checkout'
import { toEligibility, toQuote } from './adapters'

// Voucher check (P4-T03) and quote from the server-side cart (P4-T05). Both skip the global 401 sign-out so the
// checkout page can explain a refusal.
const quiet = { skipUnauthorizedHandler: true } as const

/** Asks whether a code could be used now. It reserves nothing. */
export async function checkVoucher(code: string): Promise<VoucherEligibility> {
  const { data } = await storefrontApi.get<unknown>(
    `/vouchers/${encodeURIComponent(code)}/eligibility`,
    quiet
  )
  return toEligibility(data)
}

/** Prices the caller's cart for the address and optional voucher / B08 campaigns. The cart is read on the server. */
export async function createQuote(input: {
  addressId: string
  voucherCode?: string
  campaignIds?: string[]
}): Promise<Quote> {
  const { data } = await storefrontApi.post<unknown>(
    '/quotes',
    {
      addressId: input.addressId,
      ...(input.voucherCode && { voucherCode: input.voucherCode }),
      ...(input.campaignIds && input.campaignIds.length > 0 && { campaignIds: input.campaignIds }),
    },
    quiet
  )
  return toQuote(data)
}
