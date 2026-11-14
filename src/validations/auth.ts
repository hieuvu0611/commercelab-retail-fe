import { z } from 'zod'

// The register rules mirror the identity service (P1-T03): the server is the authority, these only give
// earlier feedback. Keep the two in step.
const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 128
const MAX_NAME_LENGTH = 100

const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase())

/** Sign-in accepts any existing password; the server decides whether it is correct. */
export const LoginFormSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
})

export const RegisterFormSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Enter your full name')
      .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),
    email: emailField,
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string().min(1, 'Repeat your password'),
  })
  .superRefine((value, context) => {
    if (value.password.trim().toLowerCase() === value.email) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not be the same as your email',
      })
    }
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      })
    }
  })

export type LoginFormInput = z.input<typeof LoginFormSchema>
export type RegisterFormInput = z.input<typeof RegisterFormSchema>
export type RegisterFormOutput = z.output<typeof RegisterFormSchema>

// Kept for the NextAuth `authorize` callback, which only needs the email shape.
export const LoginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
})
