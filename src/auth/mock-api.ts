import { handleAddressMock } from '@/addresses/mock-addresses'
import { handleCartMock } from '@/cart/mock-cart'
import { handleCheckoutMock } from '@/checkout/mock-checkout'
import { handleOrderMock } from '@/orders/mock-orders'
import { handleVoucherAdminMock } from '@/checkout/mock-voucher-admin'
import { handleCatalogMock } from '@/catalog/mock-catalog'
import { handleInventoryMock } from '@/inventory/mock-inventory'
import { IamError } from './types'
import { adminCreateStaff, adminDeactivate, adminListUsers, adminSetRoles } from './mock-admin'
import type { MockGrant } from './mock-iam'
import {
  getMockState,
  mockLogin,
  mockLogout,
  mockRefresh,
  mockRegister,
  mockUpdateProfile,
  userIdFromAccessToken,
  type MockState,
} from './mock-iam'

export interface MockRequest {
  method: string
  /** Path below the API base, for example "/auth/me". */
  path: string
  authorization?: string | null
  body?: unknown
  /** Query string parameters (for example staff=true). */
  query?: Record<string, string | undefined>
  /** Value of the Idempotency-Key header, when sent. */
  idempotencyKey?: string | null
}

export interface MockResponse {
  status: number
  body: unknown
}

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({
  status,
  body: { message, code, status, ...(errors && Object.keys(errors).length > 0 && { errors }) },
})

function bearer(authorization: string | null | undefined): string | null {
  const [scheme, token] = (authorization ?? '').split(' ')
  return scheme === 'Bearer' && token ? token : null
}

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The mock backend behind /mock-api, mirroring the IAM contract (envelope, status codes, error codes). */
export function handleMockApi(
  request: MockRequest,
  state: MockState = getMockState()
): MockResponse {
  const { method, path } = request
  const body = asRecord(request.body)

  try {
    if (method === 'POST' && path === '/auth/login') {
      const session = mockLogin(state, str(body.email), str(body.password))
      return ok({
        ...session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      })
    }
    if (method === 'POST' && path === '/auth/register') {
      const email = str(body.email).trim().toLowerCase()
      const fullName = str(body.fullName).trim()
      const password = str(body.password)
      const errors: Record<string, string[]> = {}
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.email = ['Email must be a valid address']
      if (password.length < 10) errors.password = ['Password must be at least 10 characters']
      else if (password.length > 128) errors.password = ['Password must be at most 128 characters']
      else if (password.toLowerCase() === email)
        errors.password = ['Password must not be the same as the email']
      if (!fullName) errors.fullName = ['Full name is required']
      else if (fullName.length > 100) errors.fullName = ['Full name must be at most 100 characters']
      if (Object.keys(errors).length > 0)
        return failure(422, 'VALIDATION_FAILED', 'Request validation failed', errors)

      const session = mockRegister(state, { email, password, fullName })
      return ok(
        { ...session.user, accessToken: session.accessToken, refreshToken: session.refreshToken },
        'Account created',
        201
      )
    }
    if (method === 'POST' && path === '/auth/refresh') {
      const tokens = mockRefresh(state, str(body.refreshToken))
      return ok(
        { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        'Token refreshed'
      )
    }
    if (method === 'POST' && path === '/auth/logout') {
      mockLogout(state, str(body.refreshToken))
      return ok({ revoked: true }, 'Signed out')
    }

    const token = bearer(request.authorization)
    const userId = token ? userIdFromAccessToken(token) : null
    const caller = userId ? state.users.get(userId) : undefined
    const catalogResponse = handleCatalogMock(
      request,
      caller?.isActive ? caller.roles : null,
      undefined
    )
    if (catalogResponse) return catalogResponse
    const inventoryResponse = handleInventoryMock(
      request,
      caller?.isActive
        ? { name: caller.name, roles: caller.roles, warehouseScopes: caller.warehouseScopes }
        : null
    )
    if (inventoryResponse) return inventoryResponse
    const cartResponse = handleCartMock(request, caller?.isActive && userId ? userId : null)
    if (cartResponse) return cartResponse
    const customerId = caller?.isActive && userId ? userId : null
    const addressResponse = handleAddressMock(request, customerId)
    if (addressResponse) return addressResponse
    const checkoutResponse = handleCheckoutMock(request, customerId)
    if (checkoutResponse) return checkoutResponse
    const orderResponse = handleOrderMock(request, customerId)
    if (orderResponse) return orderResponse
    const voucherAdminResponse = handleVoucherAdminMock(
      request,
      caller?.isActive ? { name: caller.name, roles: caller.roles } : null
    )
    if (voucherAdminResponse) return voucherAdminResponse

    if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
    const user = state.users.get(userId)
    if (!user || !user.isActive)
      return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

    if (method === 'PATCH' && path === '/auth/me') {
      const allowed = new Set(['fullName', 'phone'])
      if (Object.keys(body).some((key) => !allowed.has(key))) {
        return failure(400, 'INVALID_JSON', 'Request body must contain one valid JSON object')
      }
      const errors: Record<string, string[]> = {}
      const update: { fullName?: string; phone?: string } = {}
      if ('fullName' in body) {
        const name = str(body.fullName).trim()
        if (!name) errors.fullName = ['Full name is required']
        else if (name.length > 100) errors.fullName = ['Full name must be at most 100 characters']
        else update.fullName = name
      }
      if ('phone' in body) {
        const phone = str(body.phone).replace(/[\s().-]/g, '')
        if (phone !== '' && !/^\+?[0-9]{7,15}$/.test(phone)) {
          errors.phone = ['Phone must be an international number of 7 to 15 digits']
        } else update.phone = phone
      }
      if (!('fullName' in body) && !('phone' in body))
        errors.fullName = ['Send at least one of fullName or phone']
      if (Object.keys(errors).length > 0)
        return failure(422, 'VALIDATION_FAILED', 'Request validation failed', errors)
      return ok(mockUpdateProfile(state, userId, update), 'Profile updated')
    }

    const adminPath = path.match(/^\/admin\/users(?:\/([^/]+)\/(roles|deactivate))?$/)
    if (adminPath) {
      if (!user.roles.includes('ACCESS_ADMIN')) {
        return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')
      }
      const [, targetId, action] = adminPath
      const grantsOf = (value: unknown): MockGrant[] =>
        Array.isArray(value)
          ? value.map((item) => {
              const entry = asRecord(item)
              const warehouseId = str(entry.warehouseId).trim()
              return { role: str(entry.role).trim(), ...(warehouseId && { warehouseId }) }
            })
          : []

      if (method === 'GET' && !targetId) {
        const limit = Number(request.query?.limit ?? 25)
        const offset = Number(request.query?.offset ?? 0)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          return failure(422, 'VALIDATION_FAILED', 'Request validation failed', {
            limit: ['Limit must be between 1 and 100'],
          })
        }
        if (!Number.isInteger(offset) || offset < 0) {
          return failure(422, 'VALIDATION_FAILED', 'Request validation failed', {
            offset: ['Offset must be zero or more'],
          })
        }
        const { items, total } = adminListUsers(state, {
          staffOnly: request.query?.staff === 'true',
          limit,
          offset,
        })
        return {
          status: 200,
          body: {
            message: 'Users retrieved',
            data: items,
            metadata: {
              total,
              page: Math.floor(offset / limit) + 1,
              pageCount: Math.ceil(total / limit),
              limit,
            },
          },
        }
      }
      if (method === 'POST' && !targetId) {
        const created = adminCreateStaff(state, {
          email: str(body.email),
          fullName: str(body.fullName),
          password: str(body.password),
          roles: grantsOf(body.roles),
          reason: str(body.reason),
        })
        return ok(created, 'User created', 201)
      }
      if (method === 'PUT' && targetId && action === 'roles') {
        return ok(
          adminSetRoles(state, userId, targetId, grantsOf(body.roles), str(body.reason)),
          'Roles updated'
        )
      }
      if (method === 'POST' && targetId && action === 'deactivate') {
        return ok(adminDeactivate(state, userId, targetId, str(body.reason)), 'User deactivated')
      }
    }

    if (method === 'GET' && path === '/auth/me') {
      const { password: _password, isActive: _isActive, grants: _grants, ...profile } = user
      return ok(profile, 'Profile retrieved')
    }
  } catch (error) {
    if (error instanceof IamError)
      return failure(error.status, error.code, error.code, error.fieldErrors)
    throw error
  }

  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
