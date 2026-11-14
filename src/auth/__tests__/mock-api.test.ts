/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import { handleMockApi } from '../mock-api'
import { createMockState, MOCK_PASSWORD } from '../mock-iam'

function login(state = createMockState(), email = 'lan@example.com', password = MOCK_PASSWORD) {
  const res = handleMockApi(
    { method: 'POST', path: '/auth/login', body: { email, password } },
    state
  )
  return {
    state,
    res,
    data: (res.body as { data?: { accessToken: string; refreshToken: string } }).data,
  }
}

describe('mock API registration', () => {
  const register = (body: unknown, state = createMockState()) =>
    handleMockApi({ method: 'POST', path: '/auth/register', body }, state)

  it('creates a customer and signs them in', () => {
    const state = createMockState()
    const res = register(
      { email: 'New@Example.com', password: 'a-long-enough-password', fullName: ' New Person ' },
      state
    )
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      data: { email: 'new@example.com', name: 'New Person', roles: ['CUSTOMER'] },
    })
    const again = handleMockApi(
      {
        method: 'POST',
        path: '/auth/login',
        body: { email: 'new@example.com', password: 'a-long-enough-password' },
      },
      state
    )
    expect(again.status).toBe(200)
  })

  it('rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED', () => {
    expect(
      register({ email: 'LAN@example.com', password: 'a-long-enough-password', fullName: 'X' })
    ).toMatchObject({
      status: 409,
      body: { code: 'EMAIL_ALREADY_REGISTERED' },
    })
  })

  it('answers 422 with field errors like the real service', () => {
    const res = register({ email: 'nope', password: 'short', fullName: ' ' })
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: {
        email: expect.any(Array),
        password: expect.any(Array),
        fullName: expect.any(Array),
      },
    })
  })
})

describe('mock API profile', () => {
  const patch = (
    state: ReturnType<typeof createMockState>,
    token: string | undefined,
    body: unknown
  ) =>
    handleMockApi(
      { method: 'PATCH', path: '/auth/me', authorization: `Bearer ${token}`, body },
      state
    )

  it('updates the name and phone, normalizing the phone', () => {
    const { state, data } = login()
    const res = patch(state, data?.accessToken, {
      fullName: ' New Name ',
      phone: '+84 (90) 123-4567',
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      data: { name: 'New Name', phone: '+84901234567', roles: ['CUSTOMER'] },
    })
    const me = handleMockApi(
      { method: 'GET', path: '/auth/me', authorization: `Bearer ${data?.accessToken}` },
      state
    )
    expect(me.body).toMatchObject({ data: { name: 'New Name', phone: '+84901234567' } })
  })

  it('clears the phone with an empty string', () => {
    const { state, data } = login()
    patch(state, data?.accessToken, { phone: '+84901234567' })
    const res = patch(state, data?.accessToken, { phone: '' })
    expect((res.body as { data: { phone?: string } }).data.phone).toBeUndefined()
  })

  it('rejects bad input and unknown fields like the real service', () => {
    const { state, data } = login()
    expect(patch(state, data?.accessToken, {}).status).toBe(422)
    expect(patch(state, data?.accessToken, { fullName: ' ' }).status).toBe(422)
    expect(patch(state, data?.accessToken, { phone: 'call me' })).toMatchObject({
      status: 422,
      body: { errors: { phone: expect.any(Array) } },
    })
    expect(patch(state, data?.accessToken, { role: 'ACCESS_ADMIN' }).status).toBe(400)
    expect(patch(state, undefined, { fullName: 'X' }).status).toBe(401)
  })
})

describe('mock API', () => {
  it('answers login with the real envelope and tokens', () => {
    const { res, data } = login()
    expect(res.status).toBe(200)
    expect(data?.accessToken).toBeTruthy()
    expect(res.body).toMatchObject({ data: { id: 'user-lan', roles: ['CUSTOMER'] } })
  })

  it('answers errors with the project error envelope', () => {
    const { res } = login(createMockState(), 'lan@example.com', 'nope')
    expect(res).toEqual({
      status: 401,
      body: { message: 'INVALID_CREDENTIALS', code: 'INVALID_CREDENTIALS', status: 401 },
    })
  })

  it('protects /auth/me with the access token', () => {
    const { state, data } = login()
    expect(handleMockApi({ method: 'GET', path: '/auth/me' }, state).status).toBe(401)
    expect(
      handleMockApi({ method: 'GET', path: '/auth/me', authorization: 'Bearer garbage' }, state)
        .status
    ).toBe(401)
    const me = handleMockApi(
      { method: 'GET', path: '/auth/me', authorization: `Bearer ${data?.accessToken}` },
      state
    )
    expect(me.status).toBe(200)
    expect(JSON.stringify(me.body)).not.toContain(MOCK_PASSWORD)
  })

  it('refreshes and signs out', () => {
    const { state, data } = login()
    const refreshed = handleMockApi(
      { method: 'POST', path: '/auth/refresh', body: { refreshToken: data?.refreshToken } },
      state
    )
    expect(refreshed.status).toBe(200)
    const next = (refreshed.body as { data: { refreshToken: string } }).data.refreshToken
    expect(
      handleMockApi({ method: 'POST', path: '/auth/logout', body: { refreshToken: next } }, state)
        .status
    ).toBe(200)
    expect(
      handleMockApi({ method: 'POST', path: '/auth/refresh', body: { refreshToken: next } }, state)
        .status
    ).toBe(401)
  })

  it('answers 404 for endpoints it does not know', () => {
    const { state, data } = login()
    expect(
      handleMockApi(
        { method: 'GET', path: '/nope', authorization: `Bearer ${data?.accessToken}` },
        state
      ).status
    ).toBe(404)
  })
})
