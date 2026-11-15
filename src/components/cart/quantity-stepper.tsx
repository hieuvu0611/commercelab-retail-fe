'use client'

import { useEffect, useState } from 'react'
import { clampQuantity } from '@/cart/quantity'
import { MAX_QUANTITY, MIN_QUANTITY } from '@/types/cart'

/** Minus, number and plus controls for a cart line; typed values are applied on blur or Enter. */
export function QuantityStepper({
  label,
  value,
  disabled = false,
  onChange,
}: {
  /** Names the controls for assistive technology, for example the product name. */
  label: string
  value: number
  disabled?: boolean
  onChange: (quantity: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const next = clampQuantity(Number(draft.replace(/\D/g, '')))
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <div className="flex" role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        aria-label={`Decrease quantity of ${label}`}
        disabled={disabled || value <= MIN_QUANTITY}
        onClick={() => onChange(value - 1)}
        className="btn btn-secondary px-3"
      >
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={`Quantity of ${label}`}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && commit()}
        className="h-11 w-14 border-y border-ink bg-paper text-center text-ink disabled:opacity-50"
      />
      <button
        type="button"
        aria-label={`Increase quantity of ${label}`}
        disabled={disabled || value >= MAX_QUANTITY}
        onClick={() => onChange(value + 1)}
        className="btn btn-secondary px-3"
      >
        +
      </button>
    </div>
  )
}
