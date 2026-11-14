import { describe, expect, it } from '@jest/globals'
import { ChangePasswordFormSchema, ProfileFormSchema } from '../account'

function messages(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message])
  )
}

describe('ProfileFormSchema', () => {
  it('trims the name and removes phone separators', () => {
    const result = ProfileFormSchema.safeParse({
      fullName: '  Lan Nguyen ',
      phone: '+84 (90) 123-4567',
    })
    expect(result.success && result.data).toEqual({ fullName: 'Lan Nguyen', phone: '+84901234567' })
  })

  it('allows an empty phone (it clears the number)', () => {
    expect(ProfileFormSchema.safeParse({ fullName: 'Lan', phone: '' }).success).toBe(true)
  })

  it('requires a name of at most 100 characters', () => {
    expect(messages(ProfileFormSchema.safeParse({ fullName: ' ', phone: '' })).fullName).toBe(
      'Enter your full name'
    )
    expect(
      messages(ProfileFormSchema.safeParse({ fullName: 'a'.repeat(101), phone: '' })).fullName
    ).toBe('Name must be at most 100 characters')
  })

  it.each(['abc', '12345', '+1234567890123456', '12-ab-34567'])('rejects the phone %p', (phone) => {
    expect(messages(ProfileFormSchema.safeParse({ fullName: 'Lan', phone })).phone).toBe(
      'Enter an international number of 7 to 15 digits'
    )
  })
})

describe('ChangePasswordFormSchema', () => {
  const valid = {
    currentPassword: 'old-password-123',
    newPassword: 'a-brand-new-password',
    confirmPassword: 'a-brand-new-password',
  }

  it('accepts a valid change', () => {
    expect(ChangePasswordFormSchema.safeParse(valid).success).toBe(true)
  })

  it('requires the current password and a long enough new one', () => {
    expect(
      messages(ChangePasswordFormSchema.safeParse({ ...valid, currentPassword: '' }))
        .currentPassword
    ).toBe('Enter your current password')
    expect(
      messages(
        ChangePasswordFormSchema.safeParse({
          ...valid,
          newPassword: 'short',
          confirmPassword: 'short',
        })
      ).newPassword
    ).toBe('Password must be at least 10 characters')
  })

  it('requires the confirmation to match and the new password to differ', () => {
    expect(
      messages(
        ChangePasswordFormSchema.safeParse({ ...valid, confirmPassword: 'something-else-1' })
      ).confirmPassword
    ).toBe('Passwords do not match')
    const same = {
      currentPassword: 'same-password-123',
      newPassword: 'same-password-123',
      confirmPassword: 'same-password-123',
    }
    expect(messages(ChangePasswordFormSchema.safeParse(same)).newPassword).toBe(
      'Choose a password different from the current one'
    )
  })
})
