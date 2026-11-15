'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'button:not([disabled])'

/**
 * A small confirmation dialog. Focus starts on Cancel (the safe choice), Tab stays inside, Escape or the backdrop
 * cancels, and focus returns to what opened it.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
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
      opener?.focus()
    }
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md border-t-4 border-ink bg-paper p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-xl">
          {title}
        </h2>
        <div className="mt-3 text-ink-2">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" disabled={isBusy} onClick={onConfirm} className="btn btn-primary">
            {isBusy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
