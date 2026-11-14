import { describe, expect, it } from '@jest/globals'
import { formatCurrency, formatFileSize } from '../format'

describe('formatFileSize', () => {
  it('returns "0 Bytes" for zero', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
  })

  it('formats kilobytes with up to two decimals', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
  })
})

describe('formatCurrency', () => {
  it('formats VND without decimals', () => {
    expect(formatCurrency(660000, 'VND')).toBe('₫660,000')
  })

  it('defaults to USD', () => {
    expect(formatCurrency(12.5)).toBe('$12.50')
  })
})
