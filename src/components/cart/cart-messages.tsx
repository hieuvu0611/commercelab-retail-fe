'use client'

import { FormAlert } from '@/components/auth/form-alert'
import { useCart } from '@/cart/cart-context'

/** Cart action errors and the guest cart merge notice, shared by the drawer and the cart page. */
export function CartMessages() {
  const { error, notice, dismissNotice } = useCart()
  return (
    <>
      <FormAlert message={error ?? undefined} />
      {notice && (
        <p
          role="status"
          className="flex items-start justify-between gap-3 border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          <span>{notice}</span>
          <button type="button" onClick={dismissNotice} className="font-label shrink-0 underline">
            Dismiss
          </button>
        </p>
      )}
    </>
  )
}
