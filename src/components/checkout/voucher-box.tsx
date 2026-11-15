'use client'

import { useState } from 'react'
import { checkVoucher } from '@/checkout/checkout-api'
import { voucherMessage } from '@/checkout/quote-state'
import { TextField } from '@/components/forms/text-field'

type Feedback = { kind: 'ok' | 'error'; text: string }

/** One voucher per order. Checking a code reserves nothing; the quote applies it. */
export function VoucherBox({
  applied,
  onApply,
  onRemove,
  externalMessage,
}: {
  applied: string | null
  onApply: (code: string) => void
  onRemove: () => void
  /** A refusal that came back with the quote (the code stopped being valid meanwhile). */
  externalMessage?: string
}) {
  const [code, setCode] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()

  async function apply(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setFeedback({ kind: 'error', text: 'Enter a voucher code.' })
      return
    }
    setIsChecking(true)
    setFeedback(undefined)
    try {
      const result = await checkVoucher(trimmed)
      if (result.eligible) {
        onApply(result.code)
        setCode('')
        setFeedback({
          kind: 'ok',
          text: `${result.code} applies: ${result.discountPct}% off the goods. Nothing is reserved until you order.`,
        })
      } else {
        setFeedback({ kind: 'error', text: voucherMessage(result.reason) })
      }
    } catch {
      setFeedback({ kind: 'error', text: 'We could not check this voucher. Please try again.' })
    } finally {
      setIsChecking(false)
    }
  }

  const message =
    feedback ?? (externalMessage ? { kind: 'error' as const, text: externalMessage } : undefined)

  return (
    <section aria-labelledby="voucher-heading">
      <h2 id="voucher-heading" className="text-xl">
        Voucher
      </h2>
      {applied ? (
        <p className="mt-3 flex flex-wrap items-center gap-3 text-ink">
          <span className="font-label border border-ink px-2 py-1">{applied}</span>
          <button
            type="button"
            onClick={onRemove}
            className="font-label min-h-11 text-sm underline"
          >
            Remove voucher
          </button>
        </p>
      ) : (
        <form onSubmit={apply} noValidate className="mt-3 flex max-w-[28rem] items-end gap-2">
          <div className="flex-1">
            <TextField
              label="Voucher code"
              value={code}
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
              error={message?.kind === 'error' ? message.text : undefined}
            />
          </div>
          <button type="submit" disabled={isChecking} className="btn btn-secondary">
            {isChecking ? 'Checking…' : 'Apply'}
          </button>
        </form>
      )}
      {message?.kind === 'ok' && (
        <p role="status" className="mt-2 text-sm text-ink-2">
          {message.text}
        </p>
      )}
      {applied && message?.kind === 'error' && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message.text}
        </p>
      )}
    </section>
  )
}
