/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import {
  createMockState,
  MOCK_PASSWORD,
  mockLogin,
  mockLogout,
  mockRefresh,
  userIdFromAccessToken,
} from '../mock-iam'
import { tokenExpiry } from '../iam-client'

const NOW = 1_800_000_000_000

describe('mock IAM', () => {
  it('signs in a seeded user and issues a token the client can read the expiry of', () => {
    const state = createMockState()
    const session = mockLogin(state, ' LAN@example.com ', MOCK_PASSWORD, NOW)

    expect(session.user).toMatchObject({ id: 'user-lan', roles: ['CUSTOMER'] })
    expect(JSON.stringify(session.user)).not.toContain(MOCK_PASSWORD)
    expect(tokenExpiry(session.accessToken, 0)).toBe(session.accessTokenExpires)
    expect(userIdFromAccessToken(session.accessToken, NOW)).toBe('user-lan')
    expect(userIdFromAccessToken(session.accessToken, session.accessTokenExpires + 1)).toBeNull()
  })

  it('rejects a wrong password and rate limits after five failures like the real service', () => {
    const state = createMockState()
    for (let i = 0; i < 5; i++) {
      expect(() => mockLogin(state, 'lan@example.com', 'wrong-password', NOW)).toThrow(
        'INVALID_CREDENTIALS'
      )
    }
    expect(() => mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)).toThrow(
      'TOO_MANY_ATTEMPTS'
    )
  })

  it('rotates refresh tokens and revokes the family when an old one is reused', () => {
    const state = createMockState()
    const { refreshToken: first } = mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)

    const second = mockRefresh(state, first, NOW)
    expect(second.refreshToken).not.toBe(first)
    expect(() => mockRefresh(state, first, NOW)).toThrow('REFRESH_TOKEN_REUSED')
    expect(() => mockRefresh(state, second.refreshToken, NOW)).toThrow('REFRESH_TOKEN_REUSED')
  })

  it('logout revokes the session and unknown tokens are invalid', () => {
    const state = createMockState()
    const { refreshToken } = mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)
    mockLogout(state, refreshToken)
    expect(() => mockRefresh(state, refreshToken, NOW)).toThrow('REFRESH_TOKEN_REUSED')
    expect(() => mockRefresh(state, 'mock-refresh-unknown', NOW)).toThrow('INVALID_REFRESH_TOKEN')
  })
})
