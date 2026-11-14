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
