import { IamError } from './types'
import {
  getMockState,
  mockLogin,
  mockLogout,
  mockRefresh,
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
