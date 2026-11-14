/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { createHttpIamClient, tokenExpiry } from '../iam-client'
import { IamError } from '../types'

function jwtWithExp(expSeconds: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ exp: expSeconds })}.signature`
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const BASE = 'http://gateway.test/api/v1'
const EXP = 1_900_000_000

describe('tokenExpiry', () => {
  it('reads exp (seconds) from a JWT as milliseconds', () => {
    expect(tokenExpiry(jwtWithExp(EXP), 0)).toBe(EXP * 1000)
  })

  it('falls back to a short lifetime when the token has no readable expiry', () => {
    expect(tokenExpiry('not-a-jwt', 1_000)).toBe(1_000 + 60_000)
    expect(tokenExpiry(`a.${Buffer.from('{}').toString('base64url')}.c`, 1_000)).toBe(
      1_000 + 60_000
    )
  })
})

describe('http IAM client', () => {
  const loginBody = {
    message: 'ok',
    data: {
      id: 'user-lan',
      name: 'Lan',
      email: 'lan@example.com',
      roles: ['CUSTOMER'],
      warehouseScopes: [],
      accessToken: jwtWithExp(EXP),
      refreshToken: 'refresh-1',
    },
  }

  it('signs in against /auth/login and maps the envelope', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, loginBody))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl, now: () => 0 })

    const session = await client.login('lan@example.com', 'secret-password')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/auth/login`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'lan@example.com',
      password: 'secret-password',
    })
    expect(session).toMatchObject({
      user: {
        id: 'user-lan',
        name: 'Lan',
        email: 'lan@example.com',
        roles: ['CUSTOMER'],
        warehouseScopes: [],
      },
      refreshToken: 'refresh-1',
      accessTokenExpires: EXP * 1000,
    })
  })

  it('accepts null or missing role lists, which the server sends for an account without warehouse scopes', async () => {
    const body = { data: { ...loginBody.data, warehouseScopes: null, roles: null } }
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, body))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl, now: () => 0 })

    const session = await client.login('lan@example.com', 'secret-password')

    expect(session.user.roles).toEqual([])
    expect(session.user.warehouseScopes).toEqual([])

    const { warehouseScopes: _omitted, ...withoutScopes } = loginBody.data
    fetchImpl.mockResolvedValue(jsonResponse(200, { data: withoutScopes }))
    expect((await client.login('lan@example.com', 'x')).user.warehouseScopes).toEqual([])
  })

  it('refreshes against /auth/refresh', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(200, { data: { accessToken: jwtWithExp(EXP), refreshToken: 'refresh-2' } })
      )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl, now: () => 0 })

    const refreshed = await client.refresh('refresh-1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/auth/refresh`)
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-1' })
    expect(refreshed).toEqual({
      accessToken: jwtWithExp(EXP),
      refreshToken: 'refresh-2',
      accessTokenExpires: EXP * 1000,
    })
  })

  it('revokes the session against /auth/logout', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { message: 'Signed out', data: { revoked: true } }))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await client.logout('refresh-1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/auth/logout`)
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-1' })
  })

  it('turns an error envelope into an IamError with the status and code', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(429, {
        message: 'Too many failed attempts',
        code: 'TOO_MANY_ATTEMPTS',
        status: 429,
      })
    )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(client.login('lan@example.com', 'x')).rejects.toMatchObject({
      name: 'IamError',
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
    })
  })

  it('reports an unreadable error body as an IamError with the HTTP status', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(client.refresh('r')).rejects.toBeInstanceOf(IamError)
    await expect(client.refresh('r')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' })
  })

  it('rejects a success response that is not the expected shape', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { data: { id: 'x' } }))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(client.login('lan@example.com', 'x')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('refuses to run without a base URL', async () => {
    const client = createHttpIamClient({ baseUrl: undefined, fetchImpl: jest.fn<typeof fetch>() })
    await expect(client.login('lan@example.com', 'x')).rejects.toMatchObject({
      code: 'API_BASE_URL_MISSING',
    })
  })
})

describe('http IAM client: change password', () => {
  it('sends the access token and discards the fresh session in the response', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        message: 'Password changed',
        data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      })
    )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(
      client.changePassword('access-1', 'old-password', 'a-brand-new-password')
    ).resolves.toBeUndefined()

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/auth/change-password`)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-1')
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: 'old-password',
      newPassword: 'a-brand-new-password',
    })
  })

  it('keeps the field errors of a rejected change', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(422, {
        message: 'Request validation failed',
        code: 'VALIDATION_FAILED',
        status: 422,
        errors: { newPassword: ['Password must be at least 10 characters'] },
      })
    )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(client.changePassword('access-1', 'old', 'short')).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      fieldErrors: { newPassword: ['Password must be at least 10 characters'] },
    })
  })

  it('reports a wrong current password as 403 INVALID_CURRENT_PASSWORD', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(403, {
        message: 'The current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
        status: 403,
      })
    )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(
      client.changePassword('access-1', 'wrong', 'a-brand-new-password')
    ).rejects.toMatchObject({
      status: 403,
      code: 'INVALID_CURRENT_PASSWORD',
    })
  })
})

describe('http IAM client: register', () => {
  it('registers and immediately ends the session the identity service started', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(201, {
          message: 'Account created',
          data: { id: 'u1', refreshToken: 'unused-refresh' },
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Signed out', data: { revoked: true } }))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(
      client.register('new@example.com', 'a-long-enough-password', 'New Person')
    ).resolves.toBeUndefined()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [registerUrl, registerInit] = fetchImpl.mock.calls[0]
    expect(registerUrl).toBe(`${BASE}/auth/register`)
    expect(JSON.parse(String(registerInit?.body))).toEqual({
      email: 'new@example.com',
      password: 'a-long-enough-password',
      fullName: 'New Person',
    })
    const [logoutUrl, logoutInit] = fetchImpl.mock.calls[1]
    expect(logoutUrl).toBe(`${BASE}/auth/logout`)
    expect(JSON.parse(String(logoutInit?.body))).toEqual({ refreshToken: 'unused-refresh' })
  })

  it('still succeeds when ending the unused session fails', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(201, { data: { refreshToken: 'unused-refresh' } }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(
      client.register('new@example.com', 'a-long-enough-password', 'New Person')
    ).resolves.toBeUndefined()
  })

  it('reports a duplicate email as 409', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(409, { message: 'exists', code: 'EMAIL_ALREADY_REGISTERED', status: 409 })
      )
    const client = createHttpIamClient({ baseUrl: BASE, fetchImpl })

    await expect(
      client.register('a@example.com', 'a-long-enough-password', 'A')
    ).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
