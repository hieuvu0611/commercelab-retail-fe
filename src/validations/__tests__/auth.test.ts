import { describe, expect, it } from '@jest/globals'
import { LoginFormSchema, RegisterFormSchema } from '../auth'

const validRegistration = {
  fullName: 'Lan Nguyen',
  email: 'Lan@Example.com',
  password: 'a-long-enough-password',
  confirmPassword: 'a-long-enough-password',
}

function issues(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message])
  )
}

describe('LoginFormSchema', () => {
  it('accepts an email and any non-empty password and lower-cases the email', () => {
    const result = LoginFormSchema.safeParse({ email: ' Lan@Example.com ', password: 'x' })
    expect(result.success && result.data).toEqual({ email: 'lan@example.com', password: 'x' })
  })

  it('requires both fields', () => {
    const result = LoginFormSchema.safeParse({ email: '', password: '' })
    expect(issues(result)).toEqual({ email: expect.any(String), password: 'Enter your password' })
  })

  it('rejects an email that is not an address', () => {
    expect(issues(LoginFormSchema.safeParse({ email: 'nope', password: 'x' })).email).toBe(
      'Enter a valid email address'
    )
  })
})

describe('RegisterFormSchema (mirrors the server policy)', () => {
  it('accepts a valid registration, trimming the name and lower-casing the email', () => {
    const result = RegisterFormSchema.safeParse({
      ...validRegistration,
      fullName: '  Lan Nguyen  ',
    })
    expect(result.success && result.data).toMatchObject({
      fullName: 'Lan Nguyen',
      email: 'lan@example.com',
    })
  })

  it('requires a name of at most 100 characters', () => {
    expect(
      issues(RegisterFormSchema.safeParse({ ...validRegistration, fullName: '   ' })).fullName
    ).toBe('Enter your full name')
    expect(
      issues(RegisterFormSchema.safeParse({ ...validRegistration, fullName: 'a'.repeat(101) }))
        .fullName
    ).toBe('Name must be at most 100 characters')
  })

  it('requires a password of 10 to 128 characters that is not the email', () => {
    const short = RegisterFormSchema.safeParse({
      ...validRegistration,
      password: '123456789',
      confirmPassword: '123456789',
    })
    expect(issues(short).password).toBe('Password must be at least 10 characters')

    const long = 'a'.repeat(129)
    expect(
      issues(
        RegisterFormSchema.safeParse({
          ...validRegistration,
          password: long,
          confirmPassword: long,
        })
      ).password
    ).toBe('Password must be at most 128 characters')

    const sameAsEmail = RegisterFormSchema.safeParse({
      ...validRegistration,
      email: 'someone@example.com',
      password: 'Someone@Example.com',
      confirmPassword: 'Someone@Example.com',
    })
    expect(issues(sameAsEmail).password).toBe('Password must not be the same as your email')
  })

  it('requires the confirmation to match', () => {
    const result = RegisterFormSchema.safeParse({
      ...validRegistration,
      confirmPassword: 'something-else-entirely',
    })
    expect(issues(result).confirmPassword).toBe('Passwords do not match')
  })
})
