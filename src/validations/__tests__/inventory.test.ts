import { OpeningStockFormSchema, parseQuantity } from '../inventory'

const valid = { skuId: 'BP-1', warehouseId: 'WH-HCM-01', qty: '25', reason: 'Cycle count' }

describe('parseQuantity', () => {
  it('accepts whole numbers, with thousands separators', () => {
    expect(parseQuantity('25')).toBe(25)
    expect(parseQuantity(' 1.000 ')).toBe(1000)
    expect(parseQuantity('1,000')).toBe(1000)
  })

  it('turns anything else into NaN so the rule is explained', () => {
    for (const text of ['', 'abc', '1.5', '-3', '2e3', '1 0']) {
      expect(parseQuantity(text)).toBeNaN()
    }
  })
})

describe('OpeningStockFormSchema', () => {
  it('accepts a valid form and returns the quantity as a number', () => {
    const result = OpeningStockFormSchema.safeParse(valid)
    expect(result.success && result.data).toEqual({
      skuId: 'BP-1',
      warehouseId: 'WH-HCM-01',
      qty: 25,
      reason: 'Cycle count',
    })
  })

  it.each([
    ['skuId', { skuId: '  ' }, 'Enter a SKU'],
    ['warehouseId', { warehouseId: '' }, 'Choose a warehouse'],
    ['qty', { qty: '0' }, 'Quantity must be a whole number from 1 to 1,000,000'],
    ['qty', { qty: '1000001' }, 'Quantity must be a whole number from 1 to 1,000,000'],
    ['qty', { qty: '2.5' }, 'Quantity must be a whole number from 1 to 1,000,000'],
    ['reason', { reason: 'ab' }, 'Give a reason of at least 3 characters'],
    ['reason', { reason: 'x'.repeat(501) }, 'The reason must be at most 500 characters'],
  ])('rejects a bad %s', (field, patch, message) => {
    const result = OpeningStockFormSchema.safeParse({ ...valid, ...patch })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors[field as keyof typeof valid]).toContain(message)
    }
  })
})
