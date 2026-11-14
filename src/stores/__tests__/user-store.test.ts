import { describe, expect, it } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { useAuth, useTokens, useUserActions } from '../user-store'

describe('user store selectors', () => {
  it.each([
    ['useAuth', useAuth],
    ['useTokens', useTokens],
    ['useUserActions', useUserActions],
  ])('%s returns a stable object across re-renders', (_name, useSelector) => {
    const { result, rerender } = renderHook(() => useSelector())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
