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

export interface MockGrant {
  role: string
  /** Empty for a role that is not limited to one warehouse. */
  warehouseId?: string
}

export interface MockUser extends SessionUser {
  password: string
  isActive: boolean
  /** The source of truth for roles and warehouseScopes (see applyGrants). */
  grants: MockGrant[]
}

const WAREHOUSE_ROLES = new Set(['WAREHOUSE_STAFF', 'WAREHOUSE_MGR'])

/** Sets the grants of a user and recomputes the roles and warehouse scopes the tokens would carry. */
export function applyGrants(user: MockUser, grants: MockGrant[]): void {
  user.grants = grants
  user.roles = [...new Set(grants.map((grant) => grant.role))].sort()
  user.warehouseScopes = [
    ...new Set(
      grants
        .filter((grant) => WAREHOUSE_ROLES.has(grant.role))
        .map((grant) => grant.warehouseId || 'ALL')
    ),
  ].sort()
}

interface RefreshRecord {
  userId: string
  familyId: string
  revoked: boolean
}

export { IamError }

export interface MockState {
  users: Map<string, MockUser>
  refreshTokens: Map<string, RefreshRecord>
  failures: Map<string, number>
  counter: number
}

function seedUsers(): Map<string, MockUser> {
  const defs: Array<{ id: string; name: string; email: string; grants: MockGrant[] }> = [
    {
      id: 'user-lan',
      name: 'Lan Nguyen',
      email: 'lan@example.com',
      grants: [{ role: 'CUSTOMER' }],
    },
    {
      id: 'staff-admin',
      name: 'Access Administrator',
      email: 'admin@commercelab.vn',
      grants: [{ role: 'ACCESS_ADMIN' }],
    },
    {
      id: 'staff-product',
      name: 'Product Staff',
      email: 'product@commercelab.vn',
      grants: [{ role: 'PRODUCT_STAFF' }],
    },
    {
      id: 'staff-marketing',
      name: 'Marketing',
      email: 'marketing@commercelab.vn',
      grants: [{ role: 'MARKETING' }],
    },
    {
      id: 'staff-wh-hcm',
      name: 'Warehouse HCM',
      email: 'wh.hcm@commercelab.vn',
      grants: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HCM-01' }],
    },
    {
      id: 'staff-whm-hcm',
      name: 'Warehouse Manager HCM',
      email: 'whmgr.hcm@commercelab.vn',
      grants: [{ role: 'WAREHOUSE_MGR', warehouseId: 'WH-HCM-01' }],
    },
    {
      id: 'staff-whm-all',
      name: 'Warehouse Manager All',
      email: 'whmgr.all@commercelab.vn',
      grants: [{ role: 'WAREHOUSE_MGR' }],
    },
    {
      id: 'staff-cskh',
      name: 'Support Agent',
      email: 'cskh@commercelab.vn',
      grants: [{ role: 'SUPPORT_AGENT' }],
    },
  ]
  const users = defs.map((def) => {
    const user: MockUser = {
      id: def.id,
      name: def.name,
      email: def.email,
      roles: [],
      warehouseScopes: [],
      password: MOCK_PASSWORD,
      isActive: true,
      grants: [],
    }
    applyGrants(user, def.grants)
    return user
  })
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

/** Updates the editable profile fields of a mock user. */
export function mockUpdateProfile(
  state: MockState,
  userId: string,
  update: { fullName?: string; phone?: string }
): SessionUser {
  const user = state.users.get(userId)
  if (!user) throw new IamError(404, 'USER_NOT_FOUND')
  if (update.fullName !== undefined) user.name = update.fullName
  if (update.phone !== undefined) user.phone = update.phone === '' ? undefined : update.phone
  return publicUser(user)
}

function publicUser(user: MockUser): SessionUser {
  const { password: _password, isActive: _isActive, grants: _grants, ...rest } = user
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
    roles: [],
    warehouseScopes: [],
    password: input.password,
    isActive: true,
    grants: [],
  }
  applyGrants(user, [{ role: 'CUSTOMER' }])
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

/** Changes the password after checking the current one and signs every session of the user out. */
export function mockChangePassword(
  state: MockState,
  userId: string,
  current: string,
  next: string
): void {
  const user = state.users.get(userId)
  if (!user) throw new IamError(404, 'USER_NOT_FOUND')
  if (user.password !== current) throw new IamError(403, 'INVALID_CURRENT_PASSWORD')
  const errors: Record<string, string[]> = {}
  if (next.length < 10) errors.newPassword = ['Password must be at least 10 characters']
  else if (next.length > 128) errors.newPassword = ['Password must be at most 128 characters']
  else if (next.toLowerCase() === user.email)
    errors.newPassword = ['Password must not be the same as the email']
  else if (next === current)
    errors.newPassword = ['New password must differ from the current password']
  if (Object.keys(errors).length > 0) throw new IamError(422, 'VALIDATION_FAILED', errors)
  user.password = next
  for (const record of state.refreshTokens.values()) {
    if (record.userId === userId) record.revoked = true
  }
}

export function mockLogout(state: MockState, refreshToken: string): void {
  const record = state.refreshTokens.get(refreshToken)
  if (!record) return
  for (const other of state.refreshTokens.values()) {
    if (other.familyId === record.familyId) other.revoked = true
  }
}

export function mockDeleteAccount(
  state: MockState,
  userId: string,
  currentPassword: string,
  confirmation: string
): void {
  const errors: Record<string, string[]> = {}
  if (!currentPassword) errors.currentPassword = ['Enter your current password']
  if (confirmation !== 'DELETE') errors.confirmation = ['Type DELETE to confirm account deletion']
  if (Object.keys(errors).length > 0) throw new IamError(422, 'VALIDATION_FAILED', errors)

  const user = state.users.get(userId)
  if (!user) throw new IamError(404, 'USER_NOT_FOUND')
  if (!user.isActive) throw new IamError(401, 'USER_INACTIVE')
  if (user.grants.some((grant) => grant.role !== 'CUSTOMER')) {
    throw new IamError(403, 'STAFF_ACCOUNT_CANNOT_SELF_DELETE')
  }
  if (user.password !== currentPassword) throw new IamError(403, 'INVALID_CURRENT_PASSWORD')

  user.email = `deleted-${userId}@anonymized.local`
  user.name = 'Deleted User'
  user.phone = undefined
  user.isActive = false
  for (const record of state.refreshTokens.values()) {
    if (record.userId === userId) record.revoked = true
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
    async register(email, password, fullName) {
      const session = mockRegister(state(), { email, password, fullName })
      mockLogout(state(), session.refreshToken)
    },
    async changePassword(accessToken, currentPassword, newPassword) {
      const userId = userIdFromAccessToken(accessToken)
      if (!userId) throw new IamError(401, 'UNAUTHORIZED')
      mockChangePassword(state(), userId, currentPassword, newPassword)
    },
    async deleteAccount(accessToken, currentPassword, confirmation) {
      const userId = userIdFromAccessToken(accessToken)
      if (!userId) throw new IamError(401, 'UNAUTHORIZED')
      mockDeleteAccount(state(), userId, currentPassword, confirmation)
    },
  }
}
