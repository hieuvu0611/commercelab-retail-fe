import type { ReactNode } from 'react'

interface StatusMessageProps {
  title: string
  description: string
  actions: ReactNode
}

// Shared body for not-found, error and unauthorized pages.
export function StatusMessage({ title, description, actions }: StatusMessageProps) {
  return (
    <section className="max-w-[40rem] border-t-4 border-ink pt-6">
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-3 max-w-[52ch] text-ink-2">{description}</p>
      <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
    </section>
  )
}
