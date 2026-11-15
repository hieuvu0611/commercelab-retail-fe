import type { MockRequest, MockResponse } from '@/auth/mock-api'
import {
  getMockVoucherState,
  normalizeCode,
  type CampaignStatus,
  type MockCampaign,
  type MockVoucherState,
} from './mock-vouchers'

/** Voucher campaign admin part of the in-app mock backend (/mock-api). Mirrors the P4-T04 contract. */

const MARKETING = 'MARKETING'
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/
const MAX_NAME_LENGTH = 100
const DEFAULT_LIMIT = 15
const MAX_LIMIT = 100

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

const invalid = (errors: Record<string, string[]>) =>
  failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', errors)

const view = (campaign: MockCampaign) => ({
  ...campaign,
  availableQuota: campaign.totalQuota - campaign.reservedQuota - campaign.consumedQuota,
})

type Body = Record<string, unknown>

const isWhole = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

function parseWindow(
  body: Body,
  current: { startsAt: string | null; endsAt: string | null },
  errors: Record<string, string[]>
) {
  const read = (field: 'startsAt' | 'endsAt'): string | null => {
    if (!(field in body)) return current[field]
    const value = body[field]
    if (value === null || value === '') return null
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value
    errors[field] = ['Must be a valid date and time']
    return current[field]
  }
  const startsAt = read('startsAt')
  const endsAt = read('endsAt')
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt) && !errors.endsAt)
    errors.endsAt = ['The end must be after the start']
  return { startsAt, endsAt }
}

function validateCommon(
  body: Body,
  current: MockCampaign | null,
  errors: Record<string, string[]>
) {
  const name = 'name' in body || !current ? body.name : current.name
  if (typeof name !== 'string' || !name.trim()) errors.name = ['Name is required']
  else if (name.trim().length > MAX_NAME_LENGTH)
    errors.name = [`Name must be at most ${MAX_NAME_LENGTH} characters`]

  const discountPct = 'discountPct' in body || !current ? body.discountPct : current.discountPct
  if (!isWhole(discountPct, 1, 100))
    errors.discountPct = ['Discount must be a whole number from 1 to 100']

  const totalQuota = 'totalQuota' in body || !current ? body.totalQuota : current.totalQuota
  const used = current ? current.reservedQuota + current.consumedQuota : 0
  if (!isWhole(totalQuota, 1)) errors.totalQuota = ['Quota must be a whole number of at least 1']
  else if (totalQuota < used)
    errors.totalQuota = [`Quota cannot be below the ${used} already reserved or used`]

  const limit =
    'perCustomerLimit' in body || !current ? body.perCustomerLimit : current.perCustomerLimit
  if (!isWhole(limit, 1)) errors.perCustomerLimit = ['Limit per customer must be at least 1']

  const status = 'status' in body || !current ? (body.status ?? 'ACTIVE') : current.status
  if (status !== 'ACTIVE' && status !== 'PAUSED')
    errors.status = ['Status must be ACTIVE or PAUSED']
  return { name, discountPct, totalQuota, limit, status }
}

/** Returns a response for a voucher admin endpoint, or null when the request is not one. */
export function handleVoucherAdminMock(
  request: MockRequest,
  caller: { name: string; roles: string[] } | null,
  state: MockVoucherState = getMockVoucherState(),
  now: () => number = Date.now
): MockResponse | null {
  const { method, path } = request
  const match = path.match(/^\/admin\/vouchers(?:\/([^/]+))?$/)
  if (!match) return null
  if (!caller) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!caller.roles.includes(MARKETING))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

  const body: Body =
    request.body !== null && typeof request.body === 'object' ? (request.body as Body) : {}
  const code = match[1] ? normalizeCode(decodeURIComponent(match[1])) : undefined

  if (!code) {
    if (method === 'GET') {
      const needle = (request.query?.q ?? '').trim().toLowerCase()
      const status = request.query?.status
      const matching = [...state.campaigns.values()]
        .filter((campaign) => !status || campaign.status === status)
        .filter(
          (campaign) =>
            !needle ||
            campaign.code.toLowerCase().includes(needle) ||
            campaign.name.toLowerCase().includes(needle)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.code.localeCompare(b.code))
      const limit = Math.min(Math.max(Number(request.query?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
      const pageCount = Math.max(Math.ceil(matching.length / limit), 1)
      const page = Math.min(Math.max(Number(request.query?.page) || 1, 1), pageCount)
      return {
        status: 200,
        body: {
          message: 'Vouchers retrieved',
          data: matching.slice((page - 1) * limit, page * limit).map(view),
          metadata: { total: matching.length, page, pageCount, limit },
        },
      }
    }
    if (method === 'POST') {
      const errors: Record<string, string[]> = {}
      const newCode = typeof body.code === 'string' ? normalizeCode(body.code) : ''
      if (!CODE_PATTERN.test(newCode))
        errors.code = ['Code must be 3 to 32 letters, digits, hyphens or underscores']
      const fields = validateCommon(body, null, errors)
      const window = parseWindow(body, { startsAt: null, endsAt: null }, errors)
      if (Object.keys(errors).length > 0) return invalid(errors)
      if (state.campaigns.has(newCode))
        return failure(409, 'VOUCHER_CODE_EXISTS', 'A voucher with this code already exists')
      const at = new Date(now()).toISOString()
      const created: MockCampaign = {
        code: newCode,
        name: (fields.name as string).trim(),
        discountPct: fields.discountPct as number,
        totalQuota: fields.totalQuota as number,
        reservedQuota: 0,
        consumedQuota: 0,
        perCustomerLimit: fields.limit as number,
        ...window,
        status: fields.status as CampaignStatus,
        createdAt: at,
        updatedAt: at,
      }
      state.campaigns.set(newCode, created)
      return ok(view(created), 'Voucher created', 201)
    }
    return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
  }

  const current = state.campaigns.get(code)
  if (!current) return failure(404, 'VOUCHER_NOT_FOUND', 'Voucher not found')
  if (method === 'GET') return ok(view(current))
  if (method === 'PUT') {
    const errors: Record<string, string[]> = {}
    const fields = validateCommon(body, current, errors)
    const window = parseWindow(body, current, errors)
    if (Object.keys(errors).length > 0) return invalid(errors)
    const isUsed = current.reservedQuota + current.consumedQuota > 0
    if (isUsed && fields.discountPct !== current.discountPct)
      return failure(
        409,
        'VOUCHER_IN_USE',
        'The discount cannot change once the voucher has been reserved or used'
      )
    const updated: MockCampaign = {
      ...current,
      name: (fields.name as string).trim(),
      discountPct: fields.discountPct as number,
      totalQuota: fields.totalQuota as number,
      perCustomerLimit: fields.limit as number,
      ...window,
      status: fields.status as CampaignStatus,
      updatedAt: new Date(now()).toISOString(),
    }
    state.campaigns.set(code, updated)
    return ok(view(updated), 'Voucher updated')
  }
  // Vouchers are never deleted: pause them instead.
  return failure(405, 'METHOD_NOT_ALLOWED', 'Vouchers cannot be deleted; pause them instead')
}
