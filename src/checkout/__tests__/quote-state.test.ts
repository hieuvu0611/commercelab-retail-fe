import type { Quote } from '@/types/checkout'
import {
  describeQuoteChange,
  formatCountdown,
  isQuoteExpired,
  secondsLeft,
  voucherMessage,
} from '../quote-state'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
const quote = (overrides: Partial<Quote> = {}): Quote => ({
  quoteId: 'q1',
  version: 'v1',
  addressId: 'a1',
  voucherCode: null,
  discountPct: 0,
  subtotalVnd: 700000,
  discountVnd: 0,
  shippingFeeVnd: 30000,
  totalPayableVnd: 730000,
  lines: [],
  expiresAt: new Date(NOW + 300000).toISOString(),
  ...overrides,
})

describe('quote countdown', () => {
  it('counts down from five minutes and stops at zero', () => {
    expect(secondsLeft(quote(), NOW)).toBe(300)
    expect(secondsLeft(quote(), NOW + 299500)).toBe(1)
    // A page clock a few seconds behind never shows more than five minutes.
    expect(secondsLeft(quote(), NOW - 3000)).toBe(300)
    expect(secondsLeft(quote(), NOW + 300000)).toBe(0)
    expect(secondsLeft(quote(), NOW + 999999)).toBe(0)
  })

  it('treats an unreadable expiry as expired', () => {
    expect(isQuoteExpired(quote({ expiresAt: 'soon' }), NOW)).toBe(true)
  })

  it('formats minutes and seconds', () => {
    expect(formatCountdown(300)).toBe('5:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(0)).toBe('0:00')
  })
})

describe('describeQuoteChange', () => {
  it('is null while the version is the same', () => {
    expect(describeQuoteChange(quote(), quote({ quoteId: 'q2' }))).toBeNull()
  })

  it('names the new total when the price changed', () => {
    const text = describeQuoteChange(quote(), quote({ version: 'v2', totalPayableVnd: 750000 }))
    expect(text).toMatch(/730\.000.*750\.000/)
  })

  it('asks for a review when the lines changed but the total did not', () => {
    expect(describeQuoteChange(quote(), quote({ version: 'v2' }))).toMatch(/review the lines/)
  })
})

describe('voucherMessage', () => {
  it.each([
    'VOUCHER_NOT_FOUND',
    'VOUCHER_NOT_ACTIVE',
    'VOUCHER_NOT_STARTED',
    'VOUCHER_EXPIRED',
    'VOUCHER_EXHAUSTED',
    'VOUCHER_LIMIT_REACHED',
  ])('explains %s in words, not as a code', (reason) => {
    expect(voucherMessage(reason)).not.toMatch(/VOUCHER_/)
  })

  it('has a fallback for an unknown reason', () => {
    expect(voucherMessage('SOMETHING_NEW')).toBe('This voucher cannot be used.')
  })
})
