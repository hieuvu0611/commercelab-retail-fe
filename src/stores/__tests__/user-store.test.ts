import { describe, expect, it } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { useAuth, useTokens, useUserActions, useUserStore } from '../user-store'

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

describe('persistence', () => {
  it('never writes tokens or the user to localStorage', () => {
    useUserStore
      .getState()
      .setTokens({ accessToken: 'access-secret', refreshToken: 'refresh-secret' })
    useUserStore.getState().setUser({
      id: 'u1',
      name: 'Lan',
      email: 'lan@example.com',
      role: 'user',
      createdAt: '',
      updatedAt: '',
    })

    const stored = window.localStorage.getItem('user-store') ?? ''
    expect(stored).not.toContain('access-secret')
    expect(stored).not.toContain('refresh-secret')
    expect(stored).not.toContain('lan@example.com')
  })
})
