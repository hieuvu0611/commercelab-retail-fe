import type { Quote } from '@/types/checkout'
import { formatVnd } from '@/catalog/money'

export const QUOTE_TTL_SECONDS = 300

/**
 * Whole seconds until the quote expires; zero once it has. A quote never lives longer than five minutes, so the
 * result is capped there: the clock of the page can be a second behind the moment the quote arrived.
 */
export function secondsLeft(quote: Pick<Quote, 'expiresAt'>, nowMs: number): number {
  const expiresMs = Date.parse(quote.expiresAt)
  if (Number.isNaN(expiresMs)) return 0
  return Math.min(Math.max(Math.ceil((expiresMs - nowMs) / 1000), 0), QUOTE_TTL_SECONDS)
}

export const isQuoteExpired = (quote: Pick<Quote, 'expiresAt'>, nowMs: number): boolean =>
  secondsLeft(quote, nowMs) === 0

/** 4:05 */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** What changed between the quote the customer saw and its replacement; null when nothing they accepted changed. */
export function describeQuoteChange(previous: Quote, next: Quote): string | null {
  if (previous.version === next.version) return null
  if (previous.totalPayableVnd !== next.totalPayableVnd) {
    return `The quote changed: the total went from ${formatVnd(previous.totalPayableVnd)} to ${formatVnd(next.totalPayableVnd)}.`
  }
  return 'The quote changed. Please review the lines before accepting.'
}

const VOUCHER_MESSAGES: Record<string, string> = {
  VOUCHER_NOT_FOUND: 'We do not recognise this voucher code.',
  VOUCHER_NOT_ACTIVE: 'This voucher is not active.',
  VOUCHER_NOT_STARTED: 'This voucher is not valid yet.',
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_EXHAUSTED: 'This voucher has been fully used.',
  VOUCHER_LIMIT_REACHED: 'You have already used this voucher the allowed number of times.',
}

export const voucherMessage = (reason: string): string =>
  VOUCHER_MESSAGES[reason] ?? 'This voucher cannot be used.'
