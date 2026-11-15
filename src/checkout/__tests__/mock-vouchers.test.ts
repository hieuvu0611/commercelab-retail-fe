import { checkEligibility, createMockVoucherState, type MockVoucherState } from '../mock-vouchers'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
let state: MockVoucherState
beforeEach(() => {
  state = createMockVoucherState()
})
const reasonOf = (code: string, userId = 'u1') => checkEligibility(state, code, userId, NOW).reason

describe('mock voucher eligibility', () => {
  it('accepts WELCOME10 in any letter case with spaces around it', () => {
    expect(checkEligibility(state, ' welcome10 ', 'u1', NOW)).toEqual({
      code: 'WELCOME10',
      eligible: true,
      reason: '',
      discountPct: 10,
    })
  })

  it.each([
    ['NOPE', 'VOUCHER_NOT_FOUND'],
    ['SOLDOUT10', 'VOUCHER_EXHAUSTED'],
  ])('refuses %s with %s', (code, reason) => expect(reasonOf(code)).toBe(reason))

  it('refuses a paused, not yet started, expired or used-up-by-this-customer campaign', () => {
    const welcome = state.campaigns.get('WELCOME10')!
    welcome.status = 'PAUSED'
    expect(reasonOf('WELCOME10')).toBe('VOUCHER_NOT_ACTIVE')
    welcome.status = 'ACTIVE'
    welcome.startsAt = '2026-12-01T00:00:00.000Z'
    expect(reasonOf('WELCOME10')).toBe('VOUCHER_NOT_STARTED')
    welcome.startsAt = null
    welcome.endsAt = '2026-11-15T10:00:00.000Z'
    expect(reasonOf('WELCOME10')).toBe('VOUCHER_EXPIRED')
    welcome.endsAt = null
    state.usages.set('WELCOME10', new Map([['u1', 1]]))
    expect(reasonOf('WELCOME10')).toBe('VOUCHER_LIMIT_REACHED')
    expect(reasonOf('WELCOME10', 'u2')).toBe('')
  })

  it('reserves nothing: the quota is unchanged after a check', () => {
    checkEligibility(state, 'LASTONE10', 'u1', NOW)
    const last = state.campaigns.get('LASTONE10')!
    expect([last.reservedQuota, last.consumedQuota]).toEqual([0, 0])
  })
})
