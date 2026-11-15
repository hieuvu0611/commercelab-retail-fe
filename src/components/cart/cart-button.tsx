'use client'

import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/cart/cart-context'

/** Header cart control: shows the unit count and opens the mini cart drawer. */
export function CartButton() {
  const { cart, openDrawer } = useCart()
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={cart.itemCount > 0 ? `Cart, ${cart.itemCount} items` : 'Cart'}
      onClick={openDrawer}
      className="font-label inline-flex h-11 items-center gap-2 px-3 text-sm text-ink transition-colors duration-150 hover:bg-paper-2 active:bg-paper-3"
    >
      <ShoppingBag aria-hidden className="size-5" />
      <span>Cart</span>
      {cart.itemCount > 0 && (
        <span
          aria-hidden
          className="inline-flex min-w-5 items-center justify-center bg-ink px-1 text-xs text-paper"
        >
          {cart.itemCount}
        </span>
      )}
    </button>
  )
}
