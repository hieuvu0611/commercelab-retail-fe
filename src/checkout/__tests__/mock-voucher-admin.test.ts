import { handleVoucherAdminMock } from '../mock-voucher-admin'
import { createMockVoucherState, type MockVoucherState } from '../mock-vouchers'

const MARKETING = { name: 'Marketing', roles: ['MARKETING'] }
let state: MockVoucherState
let nowMs: number
beforeEach(() => {
  state = createMockVoucherState()
  nowMs = Date.parse('2026-11-15T10:00:00.000Z')
})
const call = (
  method: string,
  path: string,
  body?: unknown,
  caller: { name: string; roles: string[] } | null = MARKETING,
  query?: Record<string, string>
) => handleVoucherAdminMock({ method, path, body, query }, caller, state, () => nowMs)
const data = (response: ReturnType<typeof call>) =>
  (response?.body as { data: Record<string, unknown> }).data

const VALID = {
  code: 'spring15',
  name: 'Spring 15%',
  discountPct: 15,
  totalQuota: 50,
  perCustomerLimit: 2,
}

describe('mock voucher admin: access', () => {
  it('ignores other paths, needs sign-in and the MARKETING role', () => {
    expect(call('GET', '/products')).toBeNull()
    expect(call('GET', '/admin/vouchers', undefined, null)?.status).toBe(401)
    expect(
      call('GET', '/admin/vouchers', undefined, { name: 'C', roles: ['CUSTOMER'] })?.status
    ).toBe(403)
  })
})

describe('mock voucher admin: list', () => {
  it('lists campaigns with the available bucket and paging metadata', () => {
    const response = call('GET', '/admin/vouchers')
    const body = response?.body as {
      data: Array<{ code: string; availableQuota: number }>
      metadata: { total: number }
    }
    expect(body.metadata.total).toBe(3)
    expect(body.data.find((c) => c.code === 'WELCOME10')?.availableQuota).toBe(100)
    expect(body.data.find((c) => c.code === 'SOLDOUT10')?.availableQuota).toBe(0)
  })

  it('filters by search text (code or name) and status', () => {
    state.campaigns.get('LASTONE10')!.status = 'PAUSED'
    const codes = (query: Record<string, string>) =>
      (
        call('GET', '/admin/vouchers', undefined, MARKETING, query)?.body as {
          data: Array<{ code: string }>
        }
      ).data.map((c) => c.code)
    expect(codes({ q: 'welcome' })).toEqual(['WELCOME10'])
    expect(codes({ q: 'scenario' })).toEqual(['LASTONE10'])
    expect(codes({ status: 'PAUSED' })).toEqual(['LASTONE10'])
    // A percent sign is text, not a wildcard.
    expect(codes({ q: '%%' })).toEqual([])
    expect(codes({ q: '10%' })).toEqual(['WELCOME10'])
  })

  it('pages the list', () => {
    const response = call('GET', '/admin/vouchers', undefined, MARKETING, { limit: '2', page: '2' })
    const body = response?.body as {
      data: unknown[]
      metadata: { pageCount: number; page: number }
    }
    expect(body.data).toHaveLength(1)
    expect(body.metadata).toMatchObject({ pageCount: 2, page: 2 })
  })
})

describe('mock voucher admin: create', () => {
  it('creates an upper-cased, active campaign with nothing reserved', () => {
    const response = call('POST', '/admin/vouchers', {
      ...VALID,
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-12-31T00:00:00.000Z',
    })
    expect(response?.status).toBe(201)
    expect(data(response)).toMatchObject({
      code: 'SPRING15',
      status: 'ACTIVE',
      availableQuota: 50,
      reservedQuota: 0,
      consumedQuota: 0,
      startsAt: '2026-12-01T00:00:00.000Z',
    })
    expect(state.campaigns.has('SPRING15')).toBe(true)
  })

  it('rejects a duplicate code with 409', () => {
    expect(call('POST', '/admin/vouchers', { ...VALID, code: 'welcome10' })?.body).toMatchObject({
      code: 'VOUCHER_CODE_EXISTS',
    })
  })

  it('reports every invalid field at once', () => {
    const response = call('POST', '/admin/vouchers', {
      code: 'a!',
      name: ' ',
      discountPct: 0,
      totalQuota: 0,
      perCustomerLimit: 0,
    })
    expect(response?.status).toBe(400)
    expect(Object.keys((response?.body as { errors: object }).errors).sort()).toEqual([
      'code',
      'discountPct',
      'name',
      'perCustomerLimit',
      'totalQuota',
    ])
  })

  it.each([101, 1.5, '10', null])('rejects a discount of %p', (discountPct) => {
    expect(call('POST', '/admin/vouchers', { ...VALID, discountPct })?.status).toBe(400)
  })

  it('requires the end to be after the start', () => {
    const response = call('POST', '/admin/vouchers', {
      ...VALID,
      startsAt: '2026-12-31T00:00:00.000Z',
      endsAt: '2026-12-01T00:00:00.000Z',
    })
    expect(response?.body).toMatchObject({
      errors: { endsAt: ['The end must be after the start'] },
    })
  })
})

describe('mock voucher admin: edit and deactivate', () => {
  it('reads one campaign and answers 404 for an unknown code', () => {
    expect(data(call('GET', '/admin/vouchers/welcome10'))).toMatchObject({ code: 'WELCOME10' })
    expect(call('GET', '/admin/vouchers/NOPE')?.status).toBe(404)
  })

  it('updates name, quota, limit and window but never the code', () => {
    const response = call('PUT', '/admin/vouchers/WELCOME10', {
      name: 'Welcome',
      discountPct: 10,
      totalQuota: 200,
      perCustomerLimit: 3,
      status: 'ACTIVE',
      code: 'HACK',
    })
    expect(data(response)).toMatchObject({
      code: 'WELCOME10',
      name: 'Welcome',
      totalQuota: 200,
      perCustomerLimit: 3,
    })
  })

  it('pauses and reactivates without touching the rest', () => {
    expect(data(call('PUT', '/admin/vouchers/WELCOME10', { status: 'PAUSED' }))).toMatchObject({
      status: 'PAUSED',
      discountPct: 10,
      totalQuota: 100,
    })
    expect(data(call('PUT', '/admin/vouchers/WELCOME10', { status: 'ACTIVE' }))).toMatchObject({
      status: 'ACTIVE',
    })
  })

  it('keeps the discount fixed once the voucher is reserved or used (409 VOUCHER_IN_USE)', () => {
    state.campaigns.get('WELCOME10')!.reservedQuota = 3
    expect(call('PUT', '/admin/vouchers/WELCOME10', { discountPct: 20 })?.body).toMatchObject({
      code: 'VOUCHER_IN_USE',
    })
    expect(
      call('PUT', '/admin/vouchers/WELCOME10', { discountPct: 10, name: 'Same discount' })?.status
    ).toBe(200)
  })

  it('keeps the quota at or above what is reserved and used', () => {
    const campaign = state.campaigns.get('WELCOME10')!
    campaign.reservedQuota = 3
    campaign.consumedQuota = 7
    expect(call('PUT', '/admin/vouchers/WELCOME10', { totalQuota: 9 })?.body).toMatchObject({
      errors: { totalQuota: [expect.stringContaining('10')] },
    })
    expect(call('PUT', '/admin/vouchers/WELCOME10', { totalQuota: 10 })?.status).toBe(200)
  })

  it('never deletes a voucher', () => {
    expect(call('DELETE', '/admin/vouchers/WELCOME10')?.status).toBe(405)
    expect(state.campaigns.has('WELCOME10')).toBe(true)
  })
})
