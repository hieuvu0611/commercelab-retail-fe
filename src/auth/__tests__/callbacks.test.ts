/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { createAuthCallbacks } from '../callbacks'
import { IamError, type IamClient, type IamSession } from '../types'

const NOW = 1_800_000_000_000
const FIFTEEN_MINUTES = 15 * 60 * 1000

const session: IamSession = {
  user: {
    id: 'user-lan',
    name: 'Lan',
    email: 'lan@example.com',
    roles: ['CUSTOMER'],
    warehouseScopes: [],
  },
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessTokenExpires: NOW + FIFTEEN_MINUTES,
}

function fakeIam(overrides: Partial<IamClient> = {}): jest.Mocked<IamClient> {
  return {
    login: jest.fn<IamClient['login']>().mockResolvedValue(session),
    refresh: jest.fn<IamClient['refresh']>().mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      accessTokenExpires: NOW + 2 * FIFTEEN_MINUTES,
    }),
    logout: jest.fn<IamClient['logout']>().mockResolvedValue(undefined),
    changePassword: jest.fn<IamClient['changePassword']>().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IamClient>
}

const signedInToken = {
  user: session.user,
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
  accessTokenExpires: session.accessTokenExpires,
}

describe('authorize', () => {
  it('returns the signed-in user with the tokens for valid credentials', async () => {
    const iam = fakeIam()
    const { authorize } = createAuthCallbacks({ iam, now: () => NOW })

    const user = await authorize({ email: 'lan@example.com', password: 'Dev-Passw0rd-2026' })

    expect(iam.login).toHaveBeenCalledWith('lan@example.com', 'Dev-Passw0rd-2026')
    expect(user).toMatchObject({
      id: 'user-lan',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    })
  })

  it('returns null for wrong credentials and for malformed input without calling the server', async () => {
    const iam = fakeIam({
      login: jest
        .fn<IamClient['login']>()
        .mockRejectedValue(new IamError(401, 'INVALID_CREDENTIALS')),
    })
    const { authorize } = createAuthCallbacks({ iam, now: () => NOW })

    expect(await authorize({ email: 'lan@example.com', password: 'wrong-password' })).toBeNull()
    iam.login.mockClear()
    expect(await authorize(undefined)).toBeNull()
    expect(await authorize({ email: 'not-an-email', password: 'x' })).toBeNull()
    expect(await authorize({ email: 'lan@example.com', password: '' })).toBeNull()
    expect(iam.login).not.toHaveBeenCalled()
  })

  it('surfaces rate limiting and outages as distinct errors', async () => {
    const limited = fakeIam({
      login: jest
        .fn<IamClient['login']>()
        .mockRejectedValue(new IamError(429, 'TOO_MANY_ATTEMPTS')),
    })
    await expect(
      createAuthCallbacks({ iam: limited }).authorize({ email: 'lan@example.com', password: 'x' })
    ).rejects.toThrow('TOO_MANY_ATTEMPTS')

    const down = fakeIam({
      login: jest
        .fn<IamClient['login']>()
        .mockRejectedValue(new IamError(503, 'DEPENDENCY_UNAVAILABLE')),
    })
    await expect(
      createAuthCallbacks({ iam: down }).authorize({ email: 'lan@example.com', password: 'x' })
    ).rejects.toThrow('SERVICE_UNAVAILABLE')
  })
})

describe('jwt callback', () => {
  it('stores the user and tokens on sign-in', async () => {
    const { jwt } = createAuthCallbacks({ iam: fakeIam(), now: () => NOW })

    const token = await jwt({ token: {}, user: { id: 'user-lan', ...session } })

    expect(token).toMatchObject({
      user: session.user,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      accessTokenExpires: session.accessTokenExpires,
    })
  })

  it('returns a fresh token unchanged without calling the server', async () => {
    const iam = fakeIam()
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })

    const token = await jwt({ token: { ...signedInToken } })

    expect(token).toEqual(signedInToken)
    expect(iam.refresh).not.toHaveBeenCalled()
  })

  it('refreshes a token that is about to expire and keeps the user', async () => {
    const iam = fakeIam()
    const nearExpiry = { ...signedInToken, accessTokenExpires: NOW + 10_000 } // inside the 30 s leeway
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })

    const token = await jwt({ token: nearExpiry })

    expect(iam.refresh).toHaveBeenCalledWith('refresh-1')
    expect(token).toMatchObject({
      user: session.user,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      accessTokenExpires: NOW + 2 * FIFTEEN_MINUTES,
    })
    expect(token.error).toBeUndefined()
  })

  it('refreshes an expired token', async () => {
    const iam = fakeIam()
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })

    const token = await jwt({ token: { ...signedInToken, accessTokenExpires: NOW - 1 } })

    expect(iam.refresh).toHaveBeenCalledTimes(1)
    expect(token.accessToken).toBe('access-2')
  })

  it('signs the user out when the refresh fails', async () => {
    const iam = fakeIam({
      refresh: jest
        .fn<IamClient['refresh']>()
        .mockRejectedValue(new IamError(401, 'REFRESH_TOKEN_REUSED')),
    })
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })

    const token = await jwt({ token: { ...signedInToken, accessTokenExpires: NOW - 1 } })

    expect(token.error).toBe('RefreshAccessTokenError')
    expect(token.accessToken).toBeUndefined()
    expect(token.refreshToken).toBeUndefined()
    iam.refresh.mockClear()
    expect((await jwt({ token })).error).toBe('RefreshAccessTokenError')
    expect(iam.refresh).not.toHaveBeenCalled() // a failed session is never retried with a dead token
  })

  it('signs the user out when the server cannot be reached during a refresh', async () => {
    const iam = fakeIam({
      refresh: jest.fn<IamClient['refresh']>().mockRejectedValue(new TypeError('fetch failed')),
    })
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })

    const token = await jwt({ token: { ...signedInToken, accessTokenExpires: NOW - 1 } })

    expect(token.error).toBe('RefreshAccessTokenError')
  })

  it('sends one refresh when many requests need it at once (the server revokes a reused refresh token)', async () => {
    let release: (value: {
      accessToken: string
      refreshToken: string
      accessTokenExpires: number
    }) => void = () => {}
    const iam = fakeIam({
      refresh: jest
        .fn<IamClient['refresh']>()
        .mockImplementation(() => new Promise((resolve) => (release = resolve))),
    })
    const { jwt } = createAuthCallbacks({ iam, now: () => NOW })
    const expired = { ...signedInToken, accessTokenExpires: NOW - 1 }

    const pending = [
      jwt({ token: { ...expired } }),
      jwt({ token: { ...expired } }),
      jwt({ token: { ...expired } }),
    ]
    release({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      accessTokenExpires: NOW + FIFTEEN_MINUTES,
    })
    const results = await Promise.all(pending)

    expect(iam.refresh).toHaveBeenCalledTimes(1)
    expect(results.map((t) => t.accessToken)).toEqual(['access-2', 'access-2', 'access-2'])
  })
})

describe('session callback', () => {
  it('exposes the user and the access token but never the refresh token', async () => {
    const { session: toSession } = createAuthCallbacks({ iam: fakeIam(), now: () => NOW })

    const result = await toSession({ session: { expires: 'never' }, token: { ...signedInToken } })

    expect(result.user).toEqual(session.user)
    expect(result.accessToken).toBe('access-1')
    expect(JSON.stringify(result)).not.toContain('refresh-1')
    expect(result.error).toBeUndefined()
  })

  it('reports a failed refresh without user or tokens', async () => {
    const { session: toSession } = createAuthCallbacks({ iam: fakeIam(), now: () => NOW })

    const result = await toSession({
      session: { expires: 'never' },
      token: { error: 'RefreshAccessTokenError' },
    })

    expect(result.error).toBe('RefreshAccessTokenError')
    expect(result.user).toBeUndefined()
    expect(result.accessToken).toBeUndefined()
  })
})

describe('sign-out', () => {
  it('revokes the refresh token on the server', async () => {
    const iam = fakeIam()
    const { onSignOut } = createAuthCallbacks({ iam, now: () => NOW })

    await onSignOut({ ...signedInToken })

    expect(iam.logout).toHaveBeenCalledWith('refresh-1')
  })

  it('does nothing for a session that has no refresh token', async () => {
    const iam = fakeIam()
    const { onSignOut } = createAuthCallbacks({ iam, now: () => NOW })

    await onSignOut({ error: 'RefreshAccessTokenError' })

    expect(iam.logout).not.toHaveBeenCalled()
  })

  it('still completes when the server cannot be reached', async () => {
    const iam = fakeIam({
      logout: jest.fn<IamClient['logout']>().mockRejectedValue(new Error('network down')),
    })
    const { onSignOut } = createAuthCallbacks({ iam, now: () => NOW })

    await expect(onSignOut({ ...signedInToken })).resolves.toBeUndefined()
  })
})

describe('jwt callback profile update', () => {
  it('refreshes only the name and phone shown to the user', async () => {
    const { jwt } = createAuthCallbacks({ iam: fakeIam(), now: () => NOW })

    const token = await jwt({
      token: { ...signedInToken },
      trigger: 'update',
      session: {
        name: '  New Name ',
        phone: '+84901234567',
        accessToken: 'evil',
        user: { roles: ['ACCESS_ADMIN'] },
      },
    })

    expect(token.user).toMatchObject({
      id: 'user-lan',
      name: 'New Name',
      phone: '+84901234567',
      roles: ['CUSTOMER'],
    })
    expect(token.accessToken).toBe('access-1')
    expect(token.refreshToken).toBe('refresh-1')
  })

  it('ignores updates with the wrong shape and never touches a failed session', async () => {
    const { jwt } = createAuthCallbacks({ iam: fakeIam(), now: () => NOW })

    expect(
      (await jwt({ token: { ...signedInToken }, trigger: 'update', session: 'nope' })).user
    ).toEqual(session.user)
    expect(
      (
        await jwt({
          token: { ...signedInToken },
          trigger: 'update',
          session: { name: '   ', phone: 5 },
        })
      ).user
    ).toEqual(session.user)
    const failed = { error: 'RefreshAccessTokenError' as const }
    expect(await jwt({ token: failed, trigger: 'update', session: { name: 'X' } })).toEqual(failed)
  })
})
