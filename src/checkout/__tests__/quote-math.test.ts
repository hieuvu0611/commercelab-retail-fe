import { calculateQuote, type PricedLine } from '../quote-math'

const line = (skuId: string, quantity: number, unitPriceVnd: number): PricedLine => ({
  skuId,
  skuName: skuId,
  quantity,
  unitPriceVnd,
})

describe('calculateQuote', () => {
  it('SC01: 2 x 300,000 + 1 x 100,000 with 10% and shipping gives 660,000', () => {
    const quote = calculateQuote([line('B', 1, 100000), line('A', 2, 300000)], 10)
    expect(quote.subtotalVnd).toBe(700000)
    expect(quote.discountVnd).toBe(70000)
    expect(quote.lines.map((l) => [l.skuId, l.lineDiscountVnd])).toEqual([
      ['A', 60000],
      ['B', 10000],
    ])
    expect(quote.shippingFeeVnd).toBe(30000)
    expect(quote.totalPayableVnd).toBe(660000)
  })

  it('charges shipping just below 1,000,000 of discounted merchandise and waives it at 1,000,000', () => {
    expect(calculateQuote([line('A', 1, 999999)], 0).shippingFeeVnd).toBe(30000)
    expect(calculateQuote([line('A', 1, 1000000)], 0).shippingFeeVnd).toBe(0)
    // 10% of 1,111,111 is 111,111 (floored): net 1,000,000 is free; one dong less is charged.
    expect(calculateQuote([line('A', 1, 1111111)], 10).shippingFeeVnd).toBe(0)
    expect(calculateQuote([line('A', 1, 1111110)], 10).shippingFeeVnd).toBe(30000)
  })

  it('allocates the leftover dong by largest remainder', () => {
    // Subtotal 301, 10% = 30: exact shares 9.97, 9.97, 10.07 leave two dong for the two largest remainders.
    const quote = calculateQuote([line('A', 1, 100), line('B', 1, 100), line('C', 1, 101)], 10)
    expect(quote.discountVnd).toBe(30)
    expect(quote.lines.map((l) => l.lineDiscountVnd)).toEqual([10, 10, 10])
  })

  it('breaks a tie on the remainder by ascending SKU', () => {
    // Subtotal 3, 50% floors to 1: all three remainders tie, so the first SKU takes the dong.
    const quote = calculateQuote([line('C', 1, 1), line('A', 1, 1), line('B', 1, 1)], 50)
    expect(quote.lines.map((l) => [l.skuId, l.lineDiscountVnd])).toEqual([
      ['A', 1],
      ['B', 0],
      ['C', 0],
    ])
  })

  it('never discounts shipping and keeps the sums consistent', () => {
    const quote = calculateQuote([line('A', 3, 33333)], 25)
    expect(quote.lines[0].lineNetPayableVnd + quote.discountVnd).toBe(quote.subtotalVnd)
    expect(quote.totalPayableVnd).toBe(quote.subtotalVnd - quote.discountVnd + quote.shippingFeeVnd)
  })
})
