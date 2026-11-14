import { IamError } from './types'
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
  body: { message, code, status, ...(errors && { errors }) },
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

    if (method === 'GET' && path === '/auth/me') {
      const { password: _password, isActive: _isActive, ...profile } = user
      return ok(profile, 'Profile retrieved')
    }
  } catch (error) {
    if (error instanceof IamError) return failure(error.status, error.code, error.code)
    throw error
  }

  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
