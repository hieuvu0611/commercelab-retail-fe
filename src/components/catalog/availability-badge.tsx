import { Check, TriangleAlert, X } from 'lucide-react'
import { availabilityLabel } from '@/inventory/availability'
import type { Availability } from '@/types/inventory'
import { cn } from '@/utils/tw-merge'

const STYLES = {
  IN_STOCK: { Icon: Check, tone: 'text-success' },
  LOW: { Icon: TriangleAlert, tone: 'text-ink' },
  OUT: { Icon: X, tone: 'text-error' },
} as const

/** In stock / Low stock / Out of stock in words and an icon (never colour alone, never a count). Nothing when unknown. */
export function AvailabilityBadge({
  state,
  className,
}: {
  state: Availability
  className?: string
}) {
  const label = availabilityLabel(state)
  if (state === 'unknown' || !label) return null
  const { Icon, tone } = STYLES[state]
  return (
    <span className={cn('font-label inline-flex items-center gap-1.5 text-sm', tone, className)}>
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  )
}
