/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import {
  applyGrants,
  createMockIamClient,
  createMockState,
  IamError,
  MOCK_PASSWORD,
  mockChangePassword,
  mockDeleteAccount,
  mockLogin,
  mockLogout,
  mockRefresh,
  mockUpdateProfile,
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

  it('changes the password after checking the current one and signs every session out', () => {
    const state = createMockState()
    const { refreshToken } = mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)

    expect(() =>
      mockChangePassword(state, 'user-lan', 'not-my-password', 'a-brand-new-password')
    ).toThrow('INVALID_CURRENT_PASSWORD')
    expect(() => mockChangePassword(state, 'user-lan', MOCK_PASSWORD, 'short')).toThrow(
      'VALIDATION_FAILED'
    )
    expect(() => mockChangePassword(state, 'user-lan', MOCK_PASSWORD, MOCK_PASSWORD)).toThrow(
      'VALIDATION_FAILED'
    )
    expect(() => mockRefresh(state, refreshToken, NOW)).not.toThrow() // rejected changes revoke nothing

    const { refreshToken: second } = mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)
    mockChangePassword(state, 'user-lan', MOCK_PASSWORD, 'a-brand-new-password')
    expect(() => mockRefresh(state, second, NOW)).toThrow('REFRESH_TOKEN_REUSED')
    expect(() => mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)).toThrow(
      'INVALID_CREDENTIALS'
    )
    expect(mockLogin(state, 'lan@example.com', 'a-brand-new-password', NOW).user.id).toBe(
      'user-lan'
    )
  })

  it('anonymizes a customer account on deletion, revokes refresh tokens, and blocks future sign-in', () => {
    const state = createMockState()
    mockUpdateProfile(state, 'user-lan', { phone: '+84901234567' })
    const { refreshToken } = mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)

    expect(() => mockDeleteAccount(state, 'unknown-user', MOCK_PASSWORD, 'DELETE')).toThrow(
      'USER_NOT_FOUND'
    )
    expect(() => mockDeleteAccount(state, 'user-lan', MOCK_PASSWORD, 'delete')).toThrow(
      'VALIDATION_FAILED'
    )
    expect(() => mockDeleteAccount(state, 'user-lan', 'wrong-password', 'DELETE')).toThrow(
      'INVALID_CURRENT_PASSWORD'
    )

    mockDeleteAccount(state, 'user-lan', MOCK_PASSWORD, 'DELETE')

    const deleted = state.users.get('user-lan')
    expect(deleted).toMatchObject({
      email: 'deleted-user-lan@anonymized.local',
      name: 'Deleted User',
      phone: undefined,
      isActive: false,
    })
    expect(() => mockRefresh(state, refreshToken, NOW)).toThrow('REFRESH_TOKEN_REUSED')
    expect(() => mockLogin(state, 'lan@example.com', MOCK_PASSWORD, NOW)).toThrow(
      'INVALID_CREDENTIALS'
    )
    expect(() =>
      mockLogin(state, 'deleted-user-lan@anonymized.local', MOCK_PASSWORD, NOW)
    ).toThrow('INVALID_CREDENTIALS')
    expect(() => mockDeleteAccount(state, 'user-lan', MOCK_PASSWORD, 'DELETE')).toThrow(
      'USER_INACTIVE'
    )
  })

  it('rejects self-deletion for staff accounts and wires deleteAccount into the mock client', async () => {
    const state = createMockState()
    expect(() => mockDeleteAccount(state, 'staff-admin', MOCK_PASSWORD, 'DELETE')).toThrow(
      'STAFF_ACCOUNT_CANNOT_SELF_DELETE'
    )
    expect(() => mockDeleteAccount(state, 'staff-wh-hcm', MOCK_PASSWORD, 'DELETE')).toThrow(
      'STAFF_ACCOUNT_CANNOT_SELF_DELETE'
    )

    const client = createMockIamClient(() => state)
    const session = await client.login('lan@example.com', MOCK_PASSWORD)
    await expect(client.deleteAccount('not-a-valid-token', MOCK_PASSWORD, 'DELETE')).rejects.toThrow(
      'UNAUTHORIZED'
    )
    await expect(
      client.deleteAccount(session.accessToken, MOCK_PASSWORD, 'DELETE')
    ).resolves.toBeUndefined()
    expect(state.users.get('user-lan')?.isActive).toBe(false)
  })

  it('validates inputs before lookup or staff checks and allows grant-less customers to self-delete', () => {
    const state = createMockState()

    try {
      mockDeleteAccount(state, 'staff-admin', '', 'delete')
      throw new Error('expected VALIDATION_FAILED')
    } catch (error) {
      expect(error).toBeInstanceOf(IamError)
      expect(error).toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
        fieldErrors: {
          currentPassword: ['Enter your current password'],
          confirmation: ['Type DELETE to confirm account deletion'],
        },
      })
    }

    expect(() => mockDeleteAccount(state, 'unknown-user', MOCK_PASSWORD, 'wrong')).toThrow(
      'VALIDATION_FAILED'
    )
    expect(() => mockDeleteAccount(state, 'staff-admin', 'wrong-password', 'DELETE')).toThrow(
      'STAFF_ACCOUNT_CANNOT_SELF_DELETE'
    )

    const customer = state.users.get('user-lan')!
    applyGrants(customer, [])
    expect(() => mockDeleteAccount(state, 'user-lan', MOCK_PASSWORD, 'DELETE')).not.toThrow()
    expect(customer.isActive).toBe(false)
  })
})
