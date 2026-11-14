import { formatPriceRange, priceFilterToApi, withVat } from '../money'

describe('money', () => {
  it('adds 10% VAT and rounds to whole dong', () => {
    expect(withVat(300000)).toBe(330000)
    expect(withVat(99999)).toBe(109999)
  })

  it('formats one price and a range including VAT', () => {
    expect(formatPriceRange(300000, 300000).replace(/\s/g, ' ')).toBe('330.000 ₫')
    expect(formatPriceRange(100000, 200000).replace(/\s/g, ' ')).toBe('110.000 ₫ – 220.000 ₫')
  })

  it('converts a VAT-inclusive price filter to unit prices without VAT', () => {
    expect(priceFilterToApi(330000, 'min')).toBe(300000)
    expect(priceFilterToApi(330000, 'max')).toBe(300000)
    expect(priceFilterToApi(100000, 'min')).toBe(90910)
    expect(priceFilterToApi(100000, 'max')).toBe(90909)
  })
})
