import { AddressFormSchema } from '../address'

const VALID = {
  recipient: ' Lan Nguyen ',
  phone: '+84 (901) 234-567',
  line1: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  province: 'Ho Chi Minh City',
  isDefault: false,
}

describe('AddressFormSchema', () => {
  it('trims text and strips phone separators', () => {
    const parsed = AddressFormSchema.parse(VALID)
    expect(parsed.recipient).toBe('Lan Nguyen')
    expect(parsed.phone).toBe('+84901234567')
  })

  it('requires every field and a valid phone', () => {
    const result = AddressFormSchema.safeParse({ ...VALID, recipient: ' ', phone: '12', ward: '' })
    expect(result.success).toBe(false)
    const fields = result.error?.issues.map((issue) => issue.path[0])
    expect(fields).toEqual(expect.arrayContaining(['recipient', 'phone', 'ward']))
  })

  it('enforces the length limits', () => {
    expect(AddressFormSchema.safeParse({ ...VALID, recipient: 'x'.repeat(101) }).success).toBe(
      false
    )
    expect(AddressFormSchema.safeParse({ ...VALID, line1: 'x'.repeat(201) }).success).toBe(false)
    expect(AddressFormSchema.safeParse({ ...VALID, line1: 'x'.repeat(200) }).success).toBe(true)
  })
})
