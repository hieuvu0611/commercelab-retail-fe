import { formatPriceRange } from '../money'

describe('money', () => {
  it('shows the stored price as is, because listed prices already include VAT', () => {
    expect(formatPriceRange(300000, 300000).replace(/\s/g, ' ')).toBe('300.000 ₫')
  })

  it('formats a range from the stored prices', () => {
    expect(formatPriceRange(100000, 200000).replace(/\s/g, ' ')).toBe('100.000 ₫ – 200.000 ₫')
  })
})
