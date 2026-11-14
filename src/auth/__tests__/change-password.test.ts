/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { handleChangePassword } from '../change-password'
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
const body = { currentPassword: 'old-password-123', newPassword: 'a-brand-new-password' }

function iamWith(changePassword: IamClient['changePassword']): IamClient {
  return { changePassword } as IamClient
}

describe('handleChangePassword', () => {
  it('calls the server with the session access token and reports success', async () => {
    const changePassword = jest.fn<IamClient['changePassword']>().mockResolvedValue(undefined)

    const result = await handleChangePassword({
      token,
      body,
      iam: iamWith(changePassword),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(changePassword).toHaveBeenCalledWith(
      'access-1',
      'old-password-123',
      'a-brand-new-password'
    )
  })

  it.each([
    ['no session', null],
    ['a failed session', { error: 'RefreshAccessTokenError' as const }],
    ['a session without an access token', { ...token, accessToken: undefined }],
    ['an expired access token', { ...token, accessTokenExpires: NOW - 1 }],
    ['an access token about to expire', { ...token, accessTokenExpires: NOW + 5_000 }],
  ])('answers 401 SESSION_EXPIRED for %s without calling the server', async (_name, session) => {
    const changePassword = jest.fn<IamClient['changePassword']>()

    const result = await handleChangePassword({
      token: session,
      body,
      iam: iamWith(changePassword),
      now: () => NOW,
    })

    expect(result).toEqual({ status: 401, body: { code: 'SESSION_EXPIRED' } })
    expect(changePassword).not.toHaveBeenCalled()
  })

  it.each([
    ['both fields missing', {}],
    ['no new password', { currentPassword: 'x' }],
    ['a wrong type', { currentPassword: 5, newPassword: 'a-brand-new-password' }],
    ['a body that is not an object', 'text'],
  ])('answers 400 for %s without calling the server', async (_name, bad) => {
    const changePassword = jest.fn<IamClient['changePassword']>()

    const result = await handleChangePassword({
      token,
      body: bad,
      iam: iamWith(changePassword),
      now: () => NOW,
    })

    expect(result.status).toBe(400)
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('passes the server field errors of a rejected password through', async () => {
    const changePassword = jest.fn<IamClient['changePassword']>().mockRejectedValue(
      new IamError(422, 'VALIDATION_FAILED', {
        newPassword: ['Password must be at least 10 characters'],
      })
    )

    const result = await handleChangePassword({
      token,
      body,
      iam: iamWith(changePassword),
      now: () => NOW,
    })

    expect(result).toEqual({
      status: 422,
      body: {
        code: 'VALIDATION_FAILED',
        fieldErrors: { newPassword: ['Password must be at least 10 characters'] },
      },
    })
  })

  it.each([
    [new IamError(403, 'INVALID_CURRENT_PASSWORD'), 403, 'INVALID_CURRENT_PASSWORD'],
    [new IamError(429, 'TOO_MANY_ATTEMPTS'), 429, 'TOO_MANY_ATTEMPTS'],
    [new IamError(401, 'INVALID_ACCESS_TOKEN'), 401, 'SESSION_EXPIRED'],
    [new IamError(503, 'DEPENDENCY_UNAVAILABLE'), 503, 'SERVICE_UNAVAILABLE'],
    [new IamError(500, 'ANYTHING'), 503, 'SERVICE_UNAVAILABLE'],
    [new TypeError('fetch failed'), 503, 'SERVICE_UNAVAILABLE'],
  ])('maps %p to %i %s', async (error, status, code) => {
    const changePassword = jest.fn<IamClient['changePassword']>().mockRejectedValue(error)

    const result = await handleChangePassword({
      token,
      body,
      iam: iamWith(changePassword),
      now: () => NOW,
    })

    expect(result.status).toBe(status)
    expect(result.body).toMatchObject({ code })
  })
})
