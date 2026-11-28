/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { handleDeleteAccount } from '../delete-account'
import { IamError, type IamClient } from '../types'

const NOW = 1_800_000_000_000
const token = {
  user: {
    id: 'user-lan',
    name: 'Lan',
    email: 'lan@example.com',
    roles: ['CUSTOMER'],
    warehouseScopes: [],
  },
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessTokenExpires: NOW + 10 * 60 * 1000,
}
const body = { currentPassword: 'old-password-123', confirmation: 'DELETE' }

function iamWith(deleteAccount: IamClient['deleteAccount']): IamClient {
  return { deleteAccount } as IamClient
}

describe('handleDeleteAccount', () => {
  it('calls the server with the session access token and reports success', async () => {
    const deleteAccount = jest.fn<IamClient['deleteAccount']>().mockResolvedValue(undefined)

    const result = await handleDeleteAccount({
      token,
      body,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(deleteAccount).toHaveBeenCalledWith('access-1', 'old-password-123', 'DELETE')
  })

  it.each([
    ['no session', null],
    ['a failed session', { error: 'RefreshAccessTokenError' as const }],
    ['a session without an access token', { ...token, accessToken: undefined }],
    ['an expired access token', { ...token, accessTokenExpires: NOW - 1 }],
    ['an access token about to expire', { ...token, accessTokenExpires: NOW + 5_000 }],
  ])('answers 401 SESSION_EXPIRED for %s without calling the server', async (_name, session) => {
    const deleteAccount = jest.fn<IamClient['deleteAccount']>()

    const result = await handleDeleteAccount({
      token: session,
      body,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 401, body: { code: 'SESSION_EXPIRED' } })
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it.each([
    ['both fields missing', {}],
    ['missing confirmation', { currentPassword: 'old-password-123' }],
    ['missing current password', { confirmation: 'DELETE' }],
    ['wrong types', { currentPassword: 123, confirmation: 'DELETE' }],
    ['non-object body', 'text'],
  ])('answers 400 INVALID_REQUEST for %s without calling the server', async (_name, bad) => {
    const deleteAccount = jest.fn<IamClient['deleteAccount']>()

    const result = await handleDeleteAccount({
      token,
      body: bad,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 400, body: { code: 'INVALID_REQUEST' } })
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('passes validation field errors through for 422 VALIDATION_FAILED', async () => {
    const deleteAccount = jest.fn<IamClient['deleteAccount']>().mockRejectedValue(
      new IamError(422, 'VALIDATION_FAILED', {
        confirmation: ['Type DELETE to confirm account deletion'],
      })
    )

    const result = await handleDeleteAccount({
      token,
      body,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result).toEqual({
      status: 422,
      body: {
        code: 'VALIDATION_FAILED',
        fieldErrors: { confirmation: ['Type DELETE to confirm account deletion'] },
      },
    })
  })

  it('treats 401 USER_INACTIVE as an idempotent deletion completion', async () => {
    const deleteAccount = jest
      .fn<IamClient['deleteAccount']>()
      .mockRejectedValue(new IamError(401, 'USER_INACTIVE'))

    const result = await handleDeleteAccount({
      token,
      body,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 200, body: { ok: true, alreadyDeleted: true } })
  })

  it.each([
    [new IamError(403, 'INVALID_CURRENT_PASSWORD'), 403, 'INVALID_CURRENT_PASSWORD'],
    [
      new IamError(403, 'STAFF_ACCOUNT_CANNOT_SELF_DELETE'),
      403,
      'STAFF_ACCOUNT_CANNOT_SELF_DELETE',
    ],
    [new IamError(429, 'TOO_MANY_ATTEMPTS'), 429, 'TOO_MANY_ATTEMPTS'],
    [new IamError(401, 'INVALID_ACCESS_TOKEN'), 401, 'SESSION_EXPIRED'],
    [new IamError(401, 'UNAUTHORIZED'), 401, 'SESSION_EXPIRED'],
    [new IamError(503, 'DEPENDENCY_UNAVAILABLE'), 503, 'SERVICE_UNAVAILABLE'],
    [new IamError(500, 'ANYTHING'), 503, 'SERVICE_UNAVAILABLE'],
    [new TypeError('fetch failed'), 503, 'SERVICE_UNAVAILABLE'],
  ])('maps %p to %i %s', async (error, status, code) => {
    const deleteAccount = jest.fn<IamClient['deleteAccount']>().mockRejectedValue(error)

    const result = await handleDeleteAccount({
      token,
      body,
      iam: iamWith(deleteAccount),
      now: () => NOW,
    })

    expect(result.status).toBe(status)
    expect(result.body).toMatchObject({ code })
  })
})
