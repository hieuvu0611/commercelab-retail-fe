import { describe, expect, it } from '@jest/globals'
import { safeCallbackUrl } from '../safe-redirect'

describe('safeCallbackUrl', () => {
  it.each([
    ['/account', '/account'],
    ['/account/security?tab=1', '/account/security?tab=1'],
    ['/admin/users', '/admin/users'],
    ['/', '/'],
  ])('keeps the in-app path %s', (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected)
  })

  it.each([
    ['https://evil.example/phish'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['http://localhost:3000/account'],
    ['account'],
    [''],
    ['   '],
    [null],
    [undefined],
  ])('falls back to the home page for %p', (input) => {
    expect(safeCallbackUrl(input as string | null | undefined)).toBe('/')
  })

  it('uses the given fallback', () => {
    expect(safeCallbackUrl('https://evil.example', '/account')).toBe('/account')
  })

  it('never returns the sign-in pages (no redirect loop after signing in)', () => {
    expect(safeCallbackUrl('/login')).toBe('/')
    expect(safeCallbackUrl('/register?x=1')).toBe('/')
    expect(safeCallbackUrl('/admin/login')).toBe('/')
  })
})
