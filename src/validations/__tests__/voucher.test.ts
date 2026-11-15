import { VoucherFormSchema } from '../voucher'

const VALID = {
  code: ' spring15 ',
  name: ' Spring 15% ',
  discountPct: '15',
  totalQuota: '50',
  perCustomerLimit: '2',
  startsAt: '',
  endsAt: '',
}

describe('VoucherFormSchema', () => {
  it('upper-cases the code, trims text and turns numbers into numbers', () => {
    expect(VoucherFormSchema.parse(VALID)).toMatchObject({
      code: 'SPRING15',
      name: 'Spring 15%',
      discountPct: 15,
      totalQuota: 50,
      perCustomerLimit: 2,
    })
  })

  const fieldsOf = (input: object) =>
    VoucherFormSchema.safeParse({ ...VALID, ...input }).error?.issues.map((issue) => issue.path[0])

  it.each([['a!'], ['ab'], ['x'.repeat(33)], ['has space']])('rejects the code %p', (code) => {
    expect(fieldsOf({ code })).toEqual(['code'])
  })

  it.each([['0'], ['101'], ['1.5'], ['ten'], ['']])('rejects the discount %p', (discountPct) => {
    expect(fieldsOf({ discountPct })).toContain('discountPct')
  })

  it('accepts the discount limits 1 and 100', () => {
    expect(VoucherFormSchema.safeParse({ ...VALID, discountPct: '1' }).success).toBe(true)
    expect(VoucherFormSchema.safeParse({ ...VALID, discountPct: '100' }).success).toBe(true)
  })

  it('requires a name and positive quota and limit', () => {
    expect(fieldsOf({ name: ' ', totalQuota: '0', perCustomerLimit: '0' })).toEqual([
      'name',
      'totalQuota',
      'perCustomerLimit',
    ])
  })

  it('requires the end to be after the start, but allows open ends', () => {
    expect(fieldsOf({ startsAt: '2026-12-31T10:00', endsAt: '2026-12-01T10:00' })).toEqual([
      'endsAt',
    ])
    expect(fieldsOf({ startsAt: '2026-12-01T10:00', endsAt: '2026-12-01T10:00' })).toEqual([
      'endsAt',
    ])
    expect(VoucherFormSchema.safeParse({ ...VALID, startsAt: '2026-12-01T10:00' }).success).toBe(
      true
    )
    expect(VoucherFormSchema.safeParse({ ...VALID, endsAt: '2026-12-01T10:00' }).success).toBe(true)
  })
})
