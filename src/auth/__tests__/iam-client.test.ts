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
