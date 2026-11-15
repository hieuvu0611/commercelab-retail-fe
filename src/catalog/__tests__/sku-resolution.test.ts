import type { StorefrontSku } from '@/types/catalog'
import { defaultSelection, isOptionAvailable, resolveSku, selectOption } from '../sku-resolution'

const sku = (
  skuId: string,
  color: string,
  capacity: string,
  price: number,
  isActive = true
): StorefrontSku => ({
  skuId,
  attributes: { color, capacity },
  unitPriceVnd: price,
  isActive,
})

// Navy only exists in 25 L; the grey 30 L variant is inactive.
const SKUS = [
  sku('BLK-20', 'Black', '20 L', 300000),
  sku('BLK-30', 'Black', '30 L', 340000),
  sku('NVY-25', 'Navy', '25 L', 320000),
  sku('GRY-30', 'Grey', '30 L', 330000, false),
]
const AXES = ['color', 'capacity']

describe('resolveSku', () => {
  it('resolves the SKU of a complete selection', () => {
    expect(resolveSku(SKUS, AXES, { color: 'Black', capacity: '20 L' })?.skuId).toBe('BLK-20')
  })

  it('returns undefined for an incomplete, missing or inactive combination', () => {
    expect(resolveSku(SKUS, AXES, { color: 'Black' })).toBeUndefined()
    expect(resolveSku(SKUS, AXES, { color: 'Navy', capacity: '20 L' })).toBeUndefined()
    expect(resolveSku(SKUS, AXES, { color: 'Grey', capacity: '30 L' })).toBeUndefined()
  })
})

describe('isOptionAvailable', () => {
  it('disables values that no SKU offers together with the other chosen axes', () => {
    const selection = { color: 'Black', capacity: '20 L' }
    expect(isOptionAvailable(SKUS, selection, 'capacity', '30 L')).toBe(true)
    expect(isOptionAvailable(SKUS, selection, 'color', 'Navy')).toBe(false)
  })

  it('keeps every value of an active SKU selectable when no other choice is left', () => {
    const sparse = [sku('A', 'Black', '20 L', 1), sku('B', 'Olive', '30 L', 2)]
    const selection = { color: 'Black', capacity: '20 L' }
    expect(isOptionAvailable(sparse, selection, 'color', 'Olive')).toBe(true)
    expect(isOptionAvailable(sparse, selection, 'capacity', '30 L')).toBe(true)
    expect(selectOption(sparse, selection, 'color', 'Olive')).toEqual({
      color: 'Olive',
      capacity: '30 L',
    })
  })

  it('treats a value with only inactive SKUs as unavailable', () => {
    expect(isOptionAvailable(SKUS, { capacity: '30 L' }, 'color', 'Grey')).toBe(false)
  })
})

describe('selectOption', () => {
  it('keeps the other axes when the combination exists', () => {
    expect(selectOption(SKUS, { color: 'Black', capacity: '20 L' }, 'capacity', '30 L')).toEqual({
      color: 'Black',
      capacity: '30 L',
    })
  })

  it('moves the other axes to the first SKU that has the value', () => {
    expect(selectOption(SKUS, { color: 'Black', capacity: '20 L' }, 'color', 'Navy')).toEqual({
      color: 'Navy',
      capacity: '25 L',
    })
  })
})

describe('defaultSelection', () => {
  it('starts on the cheapest orderable SKU', () => {
    expect(defaultSelection(SKUS)).toEqual({ color: 'Black', capacity: '20 L' })
    expect(defaultSelection([])).toEqual({})
  })
})
