import { toCart, toMergeResult } from '../adapters'

describe('cart adapters', () => {
  it('maps lines with the pricing contract field names', () => {
    const cart = toCart({
      items: [
        {
          skuId: 'A',
          quantity: 2,
          skuName: 'City Backpack',
          unitPriceVnd: 300000,
          lineTotalVnd: 600000,
          orderable: true,
        },
      ],
      itemCount: 2,
      subtotalVnd: 600000,
    })
    expect(cart.lines[0]).toMatchObject({
      name: 'City Backpack',
      unitPriceVnd: 300000,
      lineTotalVnd: 600000,
      isAvailable: true,
      imageUrl: null,
    })
    expect(cart.subtotalVnd).toBe(600000)
    expect(cart.itemCount).toBe(2)
  })

  it('flags a line that is no longer orderable', () => {
    const cart = toCart({ items: [{ skuId: 'A', quantity: 1, skuName: 'X', orderable: false }] })
    expect(cart.lines[0].name).toBe('X')
    expect(cart.lines[0].isAvailable).toBe(false)
  })

  it('survives garbage', () => {
    expect(toCart(null)).toEqual({ lines: [], subtotalVnd: 0, itemCount: 0 })
    expect(toCart({ lines: 'nope' }).lines).toEqual([])
  })

  it('reads skipped merge lines', () => {
    expect(toMergeResult({ skipped: [{ skuId: 'A', reason: 'SKU_UNAVAILABLE' }] }).skipped).toEqual(
      [{ skuId: 'A', reason: 'SKU_UNAVAILABLE' }]
    )
    expect(toMergeResult(undefined).skipped).toEqual([])
  })
})
