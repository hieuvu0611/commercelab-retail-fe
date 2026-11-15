import type { GuestCartLine } from '@/types/cart'
import {
  GUEST_CART_KEY,
  addGuestLine,
  guestToCart,
  readGuestCart,
  removeGuestLine,
  setGuestQuantity,
  writeGuestCart,
} from '../guest-cart'

const line = (skuId: string, quantity: number, unitPriceVnd = 300000): GuestCartLine => ({
  skuId,
  quantity,
  name: 'City Backpack',
  slug: 'city-backpack',
  imageUrl: null,
  attributes: { color: 'Black' },
  unitPriceVnd,
})

describe('guest cart', () => {
  beforeEach(() => window.localStorage.clear())

  it('adds a new line and raises the quantity of an existing SKU', () => {
    const once = addGuestLine([], line('A', 1))
    const twice = addGuestLine(once, line('A', 2))
    expect(twice).toEqual([line('A', 3)])
    expect(once).toEqual([line('A', 1)])
  })

  it('caps a quantity at 99 and floors it at 1', () => {
    expect(addGuestLine([line('A', 98)], line('A', 5))[0].quantity).toBe(99)
    expect(setGuestQuantity([line('A', 5)], 'A', 0)[0].quantity).toBe(1)
    expect(setGuestQuantity([line('A', 5)], 'A', 500)[0].quantity).toBe(99)
  })

  it('removes a line without touching the others', () => {
    expect(removeGuestLine([line('A', 1), line('B', 2)], 'A')).toEqual([line('B', 2)])
  })

  it('round-trips through localStorage and clears the key when empty', () => {
    writeGuestCart([line('A', 2)])
    expect(readGuestCart()).toEqual([line('A', 2)])
    writeGuestCart([])
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull()
  })

  it('ignores corrupted or tampered storage instead of throwing', () => {
    window.localStorage.setItem(GUEST_CART_KEY, '{not json')
    expect(readGuestCart()).toEqual([])
    window.localStorage.setItem(
      GUEST_CART_KEY,
      JSON.stringify([line('A', 2), { skuId: 'B', quantity: 500 }, 'x'])
    )
    expect(readGuestCart()).toEqual([line('A', 2)])
  })

  it('shows the guest cart as a cart with totals', () => {
    const cart = guestToCart([line('A', 2, 300000), line('B', 1, 100000)])
    expect(cart.subtotalVnd).toBe(700000)
    expect(cart.itemCount).toBe(3)
    expect(cart.lines[0].lineTotalVnd).toBe(600000)
  })
})
