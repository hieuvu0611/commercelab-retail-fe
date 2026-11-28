'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatVnd } from '@/catalog/money'
import { useCart } from '@/cart/cart-context'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { useI18n } from '@/i18n'
import { CartLineItem } from './cart-line-item'
import { CartMessages } from './cart-messages'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])'

/** Side panel with the cart. Escape or the backdrop closes it, Tab stays inside it and focus returns to the opener. */
export function MiniCartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, isLoading, setQuantity, removeItem } = useCart()
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isDrawerOpen) return
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [isDrawerOpen, closeDrawer])

  if (!isDrawerOpen) return null

  return (
    <div className="fixed inset-0 z-(--z-overlay) flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={closeDrawer} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-cart-title"
        className="relative flex h-full w-full max-w-md flex-col bg-paper shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 id="mini-cart-title" className="text-xl">
            {cart.itemCount > 0
              ? t('cart.yourCartCount', { count: cart.itemCount })
              : t('cart.yourCart')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t('cart.closeCart')}
            onClick={closeDrawer}
            className="inline-flex size-11 items-center justify-center hover:bg-paper-2"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          <div className="flex flex-col gap-3">
            <CartMessages />
          </div>
          {isLoading ? (
            <p role="status" className="py-6 text-ink-2">
              {t('cart.loading')}
            </p>
          ) : cart.lines.length === 0 ? (
            <p className="py-6 text-ink-2">{t('cart.empty')}</p>
          ) : (
            <ul aria-label={t('cart.itemsLabel')}>
              {cart.lines.map((line) => (
                <CartLineItem
                  key={line.skuId}
                  line={line}
                  onQuantityChange={(skuId, quantity) => void setQuantity(skuId, quantity)}
                  onRemove={(skuId) => void removeItem(skuId)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-rule px-5 py-4">
          <p className="flex justify-between">
            <span className="font-label text-ink">{t('cart.subtotal')}</span>
            <span className="font-label text-ink">{formatVnd(cart.subtotalVnd)}</span>
          </p>
          <p className="mt-1 text-sm text-muted">{t('cart.checkoutNote')}</p>
          <Link
            href={STOREFRONT_ROUTES.cart}
            onClick={closeDrawer}
            className="btn btn-primary mt-4 w-full"
          >
            {t('cart.viewCart')}
          </Link>
        </div>
      </div>
    </div>
  )
}
