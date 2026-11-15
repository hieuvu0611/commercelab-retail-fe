'use client'

import Link from 'next/link'
import { formatVnd } from '@/catalog/money'
import { useCart } from '@/cart/cart-context'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { CartLineItem } from './cart-line-item'
import { CartMessages } from './cart-messages'

/** The cart page: every line with quantity controls, the subtotal and a note about when prices are confirmed. */
export function CartView() {
  const { cart, isSignedIn, isLoading, setQuantity, removeItem } = useCart()

  if (isLoading)
    return (
      <p role="status" className="mt-8 text-ink-2">
        Loading your cart…
      </p>
    )

  return (
    <div className="mt-6 max-w-[48rem]">
      <div className="flex flex-col gap-3">
        <CartMessages />
      </div>
      {cart.lines.length === 0 ? (
        <div className="mt-6 border-t border-rule-2 bg-paper-2 px-6 py-8">
          <p className="font-label text-lg text-ink">Your cart is empty</p>
          <p className="mt-2 text-ink-2">Find something you like and add it here.</p>
          <Link href="/" className="btn btn-primary mt-4">
            Continue shopping
          </Link>
        </div>
      ) : (
        <>
          <ul aria-label="Cart items" className="border-t border-rule">
            {cart.lines.map((line) => (
              <CartLineItem
                key={line.skuId}
                line={line}
                onQuantityChange={(skuId, quantity) => void setQuantity(skuId, quantity)}
                onRemove={(skuId) => void removeItem(skuId)}
              />
            ))}
          </ul>
          <section aria-label="Cart summary" className="mt-6 flex flex-col items-end gap-2">
            <p className="font-label text-xl text-ink">
              Subtotal {formatVnd(cart.subtotalVnd)}
              <span className="ml-2 text-sm font-normal text-muted">
                {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}
              </span>
            </p>
            <p className="max-w-[48ch] text-right text-sm text-muted">
              Nothing is reserved while items sit in your cart. Prices, vouchers and shipping are
              confirmed in a quote at checkout.
            </p>
            {!isSignedIn && (
              <p className="max-w-[48ch] text-right text-sm text-ink-2">
                <Link href={`${STOREFRONT_ROUTES.login}?callbackUrl=%2Fcart`} className="underline">
                  Sign in
                </Link>{' '}
                to keep this cart on your account and check out. Prices shown are the ones from when
                you added the items.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
