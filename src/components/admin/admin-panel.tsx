'use client'

import { useEffect, type ReactNode } from 'react'

/** A titled inline panel for backoffice forms and confirmations; Escape cancels it. */
export function AdminPanel({
  title,
  children,
  onCancel,
  wide = false,
}: {
  title: string
  children: ReactNode
  onCancel: () => void
  /** Wider panel for tables. */
  wide?: boolean
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <section
      aria-label={title}
      className={`mt-8 border-t-4 border-ink bg-paper-2 px-6 py-6 ${wide ? 'max-w-[52rem]' : 'max-w-[34rem]'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="font-label min-h-11 text-sm text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {children}
    </section>
  )
}
