import {
  IamError,
  type IamClient,
  type IamSession,
  type RefreshedTokens,
  type SessionUser,
} from './types'

/**
 * In-memory stand-in for the IAM service, used in mock mode only (guarded by mock-guard.ts).
 * It follows the real contract closely enough to build and test the screens: Argon2-free, but with token
 * rotation, reuse detection, rate limiting and the same error codes.
 */

/** Documented development password of every mock account. */
export const MOCK_PASSWORD = 'Dev-Passw0rd-2026'

const MAX_FAILURES = 5
const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60

interface MockUser extends SessionUser {
  password: string
  isActive: boolean
}

interface RefreshRecord {
  userId: string
  familyId: string
  revoked: boolean
}

export interface MockState {
  users: Map<string, MockUser>
  refreshTokens: Map<string, RefreshRecord>
  failures: Map<string, number>
  counter: number
}

function seedUsers(): Map<string, MockUser> {
  const users: MockUser[] = [
    {
      id: 'user-lan',
      name: 'Lan Nguyen',
      email: 'lan@example.com',
      roles: ['CUSTOMER'],
      warehouseScopes: [],
    },
    {
      id: 'staff-admin',
      name: 'Access Administrator',
      email: 'admin@commercelab.vn',
      roles: ['ACCESS_ADMIN'],
      warehouseScopes: [],
    },
    {
      id: 'staff-wh-hcm',
      name: 'Warehouse HCM',
      email: 'wh.hcm@commercelab.vn',
      roles: ['WAREHOUSE_STAFF'],
      warehouseScopes: ['WH-HCM-01'],
    },
    {
      id: 'staff-cskh',
      name: 'Support Agent',
      email: 'cskh@commercelab.vn',
      roles: ['SUPPORT_AGENT'],
      warehouseScopes: [],
    },
  ].map((user) => ({ ...user, password: MOCK_PASSWORD, isActive: true }))
  return new Map(users.map((user) => [user.id, user]))
}

export function createMockState(): MockState {
  return { users: seedUsers(), refreshTokens: new Map(), failures: new Map(), counter: 0 }
}

const globalForMock = globalThis as unknown as { __mockIamState?: MockState }

/** One state per server process, shared by NextAuth and the /mock-api route handlers. */
export function getMockState(): MockState {
  globalForMock.__mockIamState ??= createMockState()
  return globalForMock.__mockIamState
}

export function resetMockState(): void {
  globalForMock.__mockIamState = createMockState()
}

function accessTtlSeconds(): number {
  const configured = Number(process.env.MOCK_ACCESS_TTL_SECONDS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ACCESS_TTL_SECONDS
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A JWT-shaped token (unsigned) so the client can read `exp` exactly as with real tokens. */
function signAccess(userId: string, nowMs: number): { token: string; expires: number } {
  const exp = Math.floor(nowMs / 1000) + accessTtlSeconds()
  return {
    token: `${encode({ alg: 'none' })}.${encode({ sub: userId, exp, mock: true })}.mock`,
    expires: exp * 1000,
  }
}

export function userIdFromAccessToken(token: string, nowMs = Date.now()): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    if (
      payload?.mock !== true ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number'
    )
      return null
    return payload.exp * 1000 > nowMs ? payload.sub : null
  } catch {
    return null
  }
}

function startRefresh(state: MockState, userId: string, familyId: string): string {
  const token = `mock-refresh-${++state.counter}-${Math.random().toString(36).slice(2)}`
  state.refreshTokens.set(token, { userId, familyId, revoked: false })
  return token
}

function publicUser(user: MockUser): SessionUser {
  const { password: _password, isActive: _isActive, ...rest } = user
  return rest
}

export function mockLogin(
  state: MockState,
  email: string,
  password: string,
  nowMs = Date.now()
): IamSession {
  const normalized = email.trim().toLowerCase()
  if ((state.failures.get(normalized) ?? 0) >= MAX_FAILURES)
    throw new IamError(429, 'TOO_MANY_ATTEMPTS')
  const user = [...state.users.values()].find((candidate) => candidate.email === normalized)
  if (!user || !user.isActive || user.password !== password) {
    state.failures.set(normalized, (state.failures.get(normalized) ?? 0) + 1)
    throw new IamError(401, 'INVALID_CREDENTIALS')
  }
  state.failures.delete(normalized)
  const access = signAccess(user.id, nowMs)
  return {
    user: publicUser(user),
    accessToken: access.token,
    refreshToken: startRefresh(state, user.id, `fam-${++state.counter}`),
    accessTokenExpires: access.expires,
  }
}

/** Creates a CUSTOMER account and signs it in. The caller has validated the input. */
export function mockRegister(
  state: MockState,
  input: { email: string; password: string; fullName: string },
  nowMs = Date.now()
): IamSession {
  const email = input.email.trim().toLowerCase()
  if ([...state.users.values()].some((user) => user.email === email))
    throw new IamError(409, 'EMAIL_ALREADY_REGISTERED')
  const user: MockUser = {
    id: `usr-mock-${++state.counter}`,
    name: input.fullName.trim(),
    email,
    roles: ['CUSTOMER'],
    warehouseScopes: [],
    password: input.password,
    isActive: true,
  }
  state.users.set(user.id, user)
  return mockLogin(state, user.email, user.password, nowMs)
}

export function mockRefresh(
  state: MockState,
  refreshToken: string,
  nowMs = Date.now()
): RefreshedTokens {
  const record = state.refreshTokens.get(refreshToken)
  if (!record) throw new IamError(401, 'INVALID_REFRESH_TOKEN')
  if (record.revoked) {
    for (const other of state.refreshTokens.values()) {
      if (other.familyId === record.familyId) other.revoked = true
    }
    throw new IamError(401, 'REFRESH_TOKEN_REUSED')
  }
  const user = state.users.get(record.userId)
  if (!user || !user.isActive) throw new IamError(401, 'USER_INACTIVE')
  record.revoked = true
  const access = signAccess(user.id, nowMs)
  return {
    accessToken: access.token,
    refreshToken: startRefresh(state, user.id, record.familyId),
    accessTokenExpires: access.expires,
  }
}

export function mockLogout(state: MockState, refreshToken: string): void {
  const record = state.refreshTokens.get(refreshToken)
  if (!record) return
  for (const other of state.refreshTokens.values()) {
    if (other.familyId === record.familyId) other.revoked = true
  }
}

/** The in-process IamClient used by NextAuth in mock mode. */
export function createMockIamClient(state: () => MockState = getMockState): IamClient {
  return {
    async login(email, password) {
      return mockLogin(state(), email, password)
    },
    async refresh(refreshToken) {
      return mockRefresh(state(), refreshToken)
    },
    async logout(refreshToken) {
      mockLogout(state(), refreshToken)
    },
  }
}
