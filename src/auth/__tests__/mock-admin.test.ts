/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import { handleMockApi } from '../mock-api'
import { createMockState, MOCK_PASSWORD, type MockState } from '../mock-iam'

function tokenFor(state: MockState, email: string): string {
  const res = handleMockApi(
    { method: 'POST', path: '/auth/login', body: { email, password: MOCK_PASSWORD } },
    state
  )
  return (res.body as { data: { accessToken: string } }).data.accessToken
}

function call(
  state: MockState,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
) {
  return handleMockApi(
    { method, path, authorization: token ? `Bearer ${token}` : null, body, query },
    state
  )
}

const CREATE = {
  email: 'New.Staff@CommerceLab.vn',
  fullName: 'New Staff',
  password: 'a-long-enough-password',
  roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HN-01' }],
  reason: 'new hire',
}

describe('mock user administration', () => {
  it('is only for access administrators', () => {
    const state = createMockState()
    expect(call(state, null, 'GET', '/admin/users').status).toBe(401)
    for (const email of ['lan@example.com', 'cskh@commercelab.vn', 'wh.hcm@commercelab.vn']) {
      const token = tokenFor(state, email)
      expect(call(state, token, 'GET', '/admin/users').status).toBe(403)
      expect(call(state, token, 'POST', '/admin/users', CREATE).status).toBe(403)
      expect(
        call(state, token, 'PUT', '/admin/users/user-lan/roles', {
          roles: [{ role: 'FINANCE' }],
          reason: 'x y z',
        }).status
      ).toBe(403)
      expect(
        call(state, token, 'POST', '/admin/users/user-lan/deactivate', { reason: 'x y z' }).status
      ).toBe(403)
    }
  })

  it('lists staff only by default filter and all users otherwise, with paging metadata', () => {
    const state = createMockState()
    const token = tokenFor(state, 'admin@commercelab.vn')

    const staff = call(state, token, 'GET', '/admin/users', undefined, {
      staff: 'true',
      limit: '2',
    })
    expect(staff.status).toBe(200)
    const body = staff.body as {
      data: { id: string }[]
      metadata: { total: number; limit: number; pageCount: number }
    }
    expect(body.data).toHaveLength(2)
    expect(body.metadata).toMatchObject({ total: 5, limit: 2, pageCount: 3 })
    expect(body.data.map((user) => user.id)).not.toContain('user-lan')

    const everyone = call(state, token, 'GET', '/admin/users').body as {
      metadata: { total: number }
    }
    expect(everyone.metadata.total).toBe(6)
    expect(call(state, token, 'GET', '/admin/users', undefined, { limit: '0' }).status).toBe(422)
  })

  it('creates a staff user who can sign in with the roles and warehouse scope', () => {
    const state = createMockState()
    const token = tokenFor(state, 'admin@commercelab.vn')

    const created = call(state, token, 'POST', '/admin/users', CREATE)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      data: {
        email: 'new.staff@commercelab.vn',
        isActive: true,
        roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HN-01' }],
      },
    })

    const login = handleMockApi(
      {
        method: 'POST',
        path: '/auth/login',
        body: { email: 'new.staff@commercelab.vn', password: CREATE.password },
      },
      state
    )
    expect(login.body).toMatchObject({
      data: { roles: ['WAREHOUSE_STAFF'], warehouseScopes: ['WH-HN-01'] },
    })
  })

  it('validates a new user like the real service', () => {
    const state = createMockState()
    const token = tokenFor(state, 'admin@commercelab.vn')
    const bad = (patch: object) =>
      call(state, token, 'POST', '/admin/users', { ...CREATE, ...patch })

    expect(bad({ email: 'nope' })).toMatchObject({
      status: 422,
      body: { errors: { email: expect.any(Array) } },
    })
    expect(bad({ password: 'short' })).toMatchObject({
      status: 422,
      body: { errors: { password: expect.any(Array) } },
    })
    expect(bad({ roles: [] })).toMatchObject({
      status: 422,
      body: { errors: { roles: expect.any(Array) } },
    })
    expect(bad({ roles: [{ role: 'SUPERUSER' }] }).status).toBe(422)
    expect(bad({ roles: [{ role: 'FINANCE', warehouseId: 'WH-HCM-01' }] }).status).toBe(422)
    expect(bad({ roles: [{ role: 'FINANCE' }, { role: 'FINANCE' }] }).status).toBe(422)
    expect(bad({ reason: 'x' })).toMatchObject({
      status: 422,
      body: { errors: { reason: expect.any(Array) } },
    })
    expect(bad({ email: 'cskh@commercelab.vn' })).toMatchObject({
      status: 409,
      body: { code: 'EMAIL_ALREADY_REGISTERED' },
    })
  })

  it('changes roles, signs the person out, and refuses to change your own access', () => {
    const state = createMockState()
    const admin = tokenFor(state, 'admin@commercelab.vn')
    const refresh = (
      handleMockApi(
        {
          method: 'POST',
          path: '/auth/login',
          body: { email: 'cskh@commercelab.vn', password: MOCK_PASSWORD },
        },
        state
      ).body as {
        data: { refreshToken: string }
      }
    ).data.refreshToken

    const changed = call(state, admin, 'PUT', '/admin/users/staff-cskh/roles', {
      roles: [{ role: 'FINANCE' }, { role: 'WAREHOUSE_MGR' }],
      reason: 'moved teams',
    })
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({
      data: { roles: [{ role: 'FINANCE' }, { role: 'WAREHOUSE_MGR' }] },
    })
    expect(call(state, null, 'POST', '/auth/refresh', { refreshToken: refresh }).status).toBe(401)

    expect(
      call(state, admin, 'PUT', '/admin/users/staff-admin/roles', {
        roles: [{ role: 'FINANCE_MGR' }],
        reason: 'grant myself',
      })
    ).toMatchObject({
      status: 403,
      body: { code: 'CANNOT_MODIFY_OWN_ACCESS' },
    })
    expect(
      call(state, admin, 'PUT', '/admin/users/nobody/roles', {
        roles: [{ role: 'FINANCE' }],
        reason: 'moved teams',
      }).status
    ).toBe(404)
  })

  it('deactivates a user, who then cannot sign in, and refuses self-deactivation', () => {
    const state = createMockState()
    const admin = tokenFor(state, 'admin@commercelab.vn')

    expect(
      call(state, admin, 'POST', '/admin/users/staff-cskh/deactivate', { reason: 'x' }).status
    ).toBe(422)
    const done = call(state, admin, 'POST', '/admin/users/staff-cskh/deactivate', {
      reason: 'left the company',
    })
    expect(done).toMatchObject({ status: 200, body: { data: { isActive: false } } })
    expect(
      handleMockApi(
        {
          method: 'POST',
          path: '/auth/login',
          body: { email: 'cskh@commercelab.vn', password: MOCK_PASSWORD },
        },
        state
      ).status
    ).toBe(401)
    expect(
      call(state, admin, 'POST', '/admin/users/staff-admin/deactivate', {
        reason: 'lock myself out',
      })
    ).toMatchObject({
      status: 403,
      body: { code: 'CANNOT_MODIFY_OWN_ACCESS' },
    })
  })
})
