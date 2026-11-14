import { ROLE_OPTIONS } from '@/configs/roles'
import { applyGrants, IamError, type MockGrant, type MockState, type MockUser } from './mock-iam'

/** User administration of the mock backend (P1-T09 contract): validation, self-protection, error codes. */

export interface AdminUser {
  id: string
  email: string
  fullName: string
  phone?: string
  isActive: boolean
  roles: MockGrant[]
}

const MIN_REASON = 3
const MAX_REASON = 500

export function toAdminUser(user: MockUser): AdminUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.name,
    ...(user.phone !== undefined && { phone: user.phone }),
    isActive: user.isActive,
    roles: user.grants.map((grant) => ({
      role: grant.role,
      ...(grant.warehouseId && { warehouseId: grant.warehouseId }),
    })),
  }
}

function fail(status: number, code: string, errors?: Record<string, string[]>): never {
  throw new IamError(status, code, errors)
}

function validReason(reason: string): string[] | undefined {
  const length = reason.trim().length
  return length < MIN_REASON || length > MAX_REASON
    ? ['Reason is required (3 to 500 characters)']
    : undefined
}

/** Returns the problems of a grant list, or undefined when it is valid. */
export function grantProblems(grants: MockGrant[]): string[] | undefined {
  if (grants.length === 0) return ['At least one role is required']
  const problems: string[] = []
  const seen = new Set<string>()
  for (const grant of grants) {
    const option = ROLE_OPTIONS.find((candidate) => candidate.value === grant.role)
    if (!option) problems.push(`Unknown role ${grant.role}`)
    else if (grant.warehouseId && !option.isWarehouseRole)
      problems.push(`${grant.role} cannot be limited to a warehouse`)
    const key = `${grant.role}@${grant.warehouseId ?? ''}`
    if (seen.has(key)) problems.push(`Duplicate grant ${key}`)
    seen.add(key)
  }
  return problems.length > 0 ? problems : undefined
}

export function adminListUsers(
  state: MockState,
  filter: { staffOnly: boolean; limit: number; offset: number }
): { items: AdminUser[]; total: number } {
  const all = [...state.users.values()].filter(
    (user) => !filter.staffOnly || user.grants.some((grant) => grant.role !== 'CUSTOMER')
  )
  return {
    items: all.slice(filter.offset, filter.offset + filter.limit).map(toAdminUser),
    total: all.length,
  }
}

export interface CreateStaffInput {
  email: string
  fullName: string
  password: string
  roles: MockGrant[]
  reason: string
}

export function adminCreateStaff(state: MockState, input: CreateStaffInput): AdminUser {
  const errors: Record<string, string[]> = {}
  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['Email must be a valid address']
  if (input.password.length < 10) errors.password = ['Password must be at least 10 characters']
  else if (input.password.length > 128)
    errors.password = ['Password must be at most 128 characters']
  else if (input.password.toLowerCase() === email)
    errors.password = ['Password must not be the same as the email']
  if (!fullName) errors.fullName = ['Full name is required']
  else if (fullName.length > 100) errors.fullName = ['Full name must be at most 100 characters']
  const roleProblems = grantProblems(input.roles)
  if (roleProblems) errors.roles = roleProblems
  const reasonProblems = validReason(input.reason)
  if (reasonProblems) errors.reason = reasonProblems
  if (Object.keys(errors).length > 0) fail(422, 'VALIDATION_FAILED', errors)
  if ([...state.users.values()].some((user) => user.email === email))
    fail(409, 'EMAIL_ALREADY_REGISTERED')

  const user: MockUser = {
    id: `usr-mock-${++state.counter}`,
    name: fullName,
    email,
    roles: [],
    warehouseScopes: [],
    password: input.password,
    isActive: true,
    grants: [],
  }
  applyGrants(user, input.roles)
  state.users.set(user.id, user)
  return toAdminUser(user)
}

export function adminSetRoles(
  state: MockState,
  actorId: string,
  targetId: string,
  roles: MockGrant[],
  reason: string
): AdminUser {
  const errors: Record<string, string[]> = {}
  const roleProblems = grantProblems(roles)
  if (roleProblems) errors.roles = roleProblems
  const reasonProblems = validReason(reason)
  if (reasonProblems) errors.reason = reasonProblems
  if (Object.keys(errors).length > 0) fail(422, 'VALIDATION_FAILED', errors)
  if (actorId === targetId) fail(403, 'CANNOT_MODIFY_OWN_ACCESS')
  const user = state.users.get(targetId)
  if (!user) fail(404, 'USER_NOT_FOUND')
  applyGrants(user, roles)
  for (const record of state.refreshTokens.values()) {
    if (record.userId === targetId) record.revoked = true
  }
  return toAdminUser(user)
}

export function adminDeactivate(
  state: MockState,
  actorId: string,
  targetId: string,
  reason: string
): AdminUser {
  const reasonProblems = validReason(reason)
  if (reasonProblems) fail(422, 'VALIDATION_FAILED', { reason: reasonProblems })
  if (actorId === targetId) fail(403, 'CANNOT_MODIFY_OWN_ACCESS')
  const user = state.users.get(targetId)
  if (!user) fail(404, 'USER_NOT_FOUND')
  user.isActive = false
  for (const record of state.refreshTokens.values()) {
    if (record.userId === targetId) record.revoked = true
  }
  return toAdminUser(user)
}
