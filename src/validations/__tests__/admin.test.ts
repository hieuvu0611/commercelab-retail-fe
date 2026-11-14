import { describe, expect, it } from '@jest/globals'
import { CreateStaffFormSchema, DeactivateFormSchema, RolesFormSchema } from '../admin'

const valid = {
  fullName: ' New Staff ',
  email: 'New.Staff@CommerceLab.vn',
  password: 'a-long-enough-password',
  roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HN-01' }],
  reason: ' new hire ',
}

function messages(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message])
  )
}

describe('CreateStaffFormSchema', () => {
  it('trims and normalizes a valid request', () => {
    const result = CreateStaffFormSchema.safeParse(valid)
    expect(result.success && result.data).toMatchObject({
      fullName: 'New Staff',
      email: 'new.staff@commercelab.vn',
      reason: 'new hire',
    })
  })

  it.each([
    ['email', { email: 'nope' }, 'Enter a valid email address'],
    ['password', { password: 'short' }, 'The initial password must be at least 10 characters'],
    ['roles', { roles: [] }, 'Choose at least one role'],
    ['roles', { roles: [{ role: 'SUPERUSER' }] }, 'Choose roles from the list'],
    ['reason', { reason: 'x' }, 'Give a reason of at least 3 characters'],
    ['fullName', { fullName: '  ' }, 'Enter the full name'],
  ])('rejects a bad %s', (field, patch, message) => {
    expect(messages(CreateStaffFormSchema.safeParse({ ...valid, ...patch }))[field]).toBe(message)
  })
})

describe('RolesFormSchema and DeactivateFormSchema', () => {
  it('need at least one role and a reason', () => {
    expect(
      RolesFormSchema.safeParse({ roles: [{ role: 'FINANCE' }], reason: 'moved teams' }).success
    ).toBe(true)
    expect(messages(RolesFormSchema.safeParse({ roles: [], reason: 'moved teams' })).roles).toBe(
      'Choose at least one role'
    )
    expect(
      messages(RolesFormSchema.safeParse({ roles: [{ role: 'FINANCE' }], reason: '' })).reason
    ).toBe('Give a reason of at least 3 characters')
  })

  it('needs a reason of 3 to 500 characters', () => {
    expect(DeactivateFormSchema.safeParse({ reason: 'left the company' }).success).toBe(true)
    expect(DeactivateFormSchema.safeParse({ reason: 'ab' }).success).toBe(false)
    expect(DeactivateFormSchema.safeParse({ reason: 'a'.repeat(501) }).success).toBe(false)
  })
})
