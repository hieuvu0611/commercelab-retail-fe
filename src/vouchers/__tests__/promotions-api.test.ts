import { toQuote } from '@/checkout/adapters'
import { storefrontApi } from '@/services/api/clients'
import {
  createPromotionCampaign,
  listActivePromotions,
  listAdminPromotions,
} from '@/vouchers/promotions-api'

describe('Module 3 B08 Promotion Campaigns', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('adapts appliedCampaigns onto Quote cleanly', () => {
    const quote = toQuote({
      quoteId: 'Q-PROMO-1',
      version: 'abc',
      addressId: 'addr-1',
      subtotalVnd: 1100000,
      discountVnd: 74000,
      shippingFeeVnd: 0,
      totalPayableVnd: 1026000,
      appliedCampaigns: [
        { campaignId: 'CAMP-1', code: 'SPRING20K', name: 'Spring 20k', discountVnd: 20000 },
        { campaignId: 'CAMP-TIER1M', code: 'TIER1M5', name: 'Auto 5%', discountVnd: 54000 },
      ],
      lines: [],
      expiresAt: '2026-11-17T12:00:00Z',
    })

    expect(quote.appliedCampaigns).toHaveLength(2)
    expect(quote.appliedCampaigns?.[0].code).toBe('SPRING20K')
    expect(quote.discountVnd).toBe(74000)
  })

  it('calls real gateway endpoints for active/admin promotions and fails loudly on network error', async () => {
    const getSpy = jest.spyOn(storefrontApi, 'get').mockResolvedValueOnce({ data: [] } as never)
    await listActivePromotions()
    expect(getSpy).toHaveBeenCalledWith('/promotions/active', { skipUnauthorizedHandler: true })

    jest.spyOn(storefrontApi, 'get').mockRejectedValueOnce(new Error('503'))
    await expect(listAdminPromotions()).rejects.toThrow('503')

    const postSpy = jest
      .spyOn(storefrontApi, 'post')
      .mockResolvedValueOnce({ data: { campaignId: 'CAMP-X' } } as never)
    await createPromotionCampaign({
      code: 'X',
      name: 'Test',
      discountType: 'FIXED_AMOUNT',
      discountValue: 10000,
      maxDiscountVnd: 0,
      minOrderVnd: 0,
      eligibleCategoryIds: [],
      eligibleSkuIds: [],
      customerSegment: 'ALL',
      autoApply: false,
      stackable: true,
      priority: 10,
      totalQuota: 10,
      budgetVnd: 100000,
      perCustomerLimit: 1,
      status: 'ACTIVE',
    })
    expect(postSpy).toHaveBeenCalledWith(
      '/admin/promotions',
      expect.objectContaining({ code: 'X' }),
      { skipUnauthorizedHandler: true }
    )
  })
})
