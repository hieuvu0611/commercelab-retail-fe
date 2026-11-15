import { fromLocalInput, toCampaign, toLocalInput } from '../adapters'

describe('voucher adapters', () => {
  it('maps a campaign and derives the available quota when it is missing', () => {
    expect(
      toCampaign({
        code: 'WELCOME10',
        name: 'Welcome',
        discountPct: 10,
        totalQuota: 100,
        reservedQuota: 3,
        consumedQuota: 7,
        perCustomerLimit: 1,
        startsAt: null,
        endsAt: '2026-12-31T00:00:00Z',
        status: 'PAUSED',
      })
    ).toEqual({
      code: 'WELCOME10',
      name: 'Welcome',
      discountPct: 10,
      totalQuota: 100,
      availableQuota: 90,
      reservedQuota: 3,
      consumedQuota: 7,
      perCustomerLimit: 1,
      startsAt: null,
      endsAt: '2026-12-31T00:00:00Z',
      status: 'PAUSED',
    })
  })

  it('treats an unknown status as active and survives garbage', () => {
    expect(toCampaign({ status: 'WHATEVER' }).status).toBe('ACTIVE')
    expect(toCampaign(null)).toMatchObject({ code: '', perCustomerLimit: 1, totalQuota: 0 })
  })

  it('round-trips a window through the datetime-local value', () => {
    const iso = '2026-12-01T03:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('not a date')).toBeNull()
  })
})
