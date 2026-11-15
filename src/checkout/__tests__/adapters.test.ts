import { toEligibility, toQuote } from '../adapters'

describe('checkout adapters', () => {
  it('maps the quote of the pricing service', () => {
    const quote = toQuote({
      quoteId: 'q1',
      version: 'abc',
      addressId: 'a1',
      voucherCode: 'WELCOME10',
      discountPct: 10,
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      totalPayableVnd: 660000,
      lines: [
        {
          skuId: 'A',
          skuName: 'City Backpack',
          quantity: 2,
          unitPriceVnd: 300000,
          lineSubtotalVnd: 600000,
          lineDiscountVnd: 60000,
          lineNetPayableVnd: 540000,
          allocatedUnitPaidVnd: 270000,
        },
      ],
      expiresAt: '2026-11-15T10:05:00Z',
    })
    expect(quote).toMatchObject({
      totalPayableVnd: 660000,
      voucherCode: 'WELCOME10',
      version: 'abc',
    })
    expect(quote.lines[0]).toMatchObject({ lineDiscountVnd: 60000, allocatedUnitPaidVnd: 270000 })
  })

  it('derives missing line sums and treats an empty voucher code as none', () => {
    const quote = toQuote({
      voucherCode: '',
      lines: [{ skuId: 'A', quantity: 2, unitPriceVnd: 100, lineDiscountVnd: 20 }],
    })
    expect(quote.voucherCode).toBeNull()
    expect(quote.lines[0]).toMatchObject({ lineSubtotalVnd: 200, lineNetPayableVnd: 180 })
  })

  it('survives garbage', () => {
    expect(toQuote(null).lines).toEqual([])
    expect(toEligibility(undefined)).toEqual({
      code: '',
      eligible: false,
      reason: '',
      discountPct: 0,
    })
  })

  it('reads an eligibility answer', () => {
    expect(
      toEligibility({ code: 'X', eligible: false, reason: 'VOUCHER_EXPIRED', discountPct: 0 })
    ).toEqual({ code: 'X', eligible: false, reason: 'VOUCHER_EXPIRED', discountPct: 0 })
  })
})
