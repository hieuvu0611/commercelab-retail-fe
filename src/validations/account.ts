import { z } from 'zod'

// Mirrors the identity service (P1-T10); the server stays the authority.
const MAX_NAME_LENGTH = 100
const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 128
const PHONE_SEPARATORS = /[\s().-]/g
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/

export const ProfileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter your full name')
    .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),
  // Optional. Spaces, dashes, dots and brackets are allowed and removed; an empty value clears the number.
  phone: z
    .string()
    .transform((value) => value.replace(PHONE_SEPARATORS, ''))
    .refine(
      (value) => value === '' || PHONE_PATTERN.test(value),
      'Enter an international number of 7 to 15 digits'
    ),
})

export const ChangePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string().min(1, 'Repeat your new password'),
  })
  .superRefine((value, context) => {
    if (value.newPassword && value.newPassword === value.currentPassword) {
      context.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Choose a password different from the current one',
      })
    }
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      })
    }
  })

export const DeleteAccountFormSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  confirmation: z
    .string()
    .trim()
    .refine((value) => value === 'DELETE', 'Type DELETE to confirm account deletion'),
})

export type ProfileFormInput = z.input<typeof ProfileFormSchema>
export type ProfileFormOutput = z.output<typeof ProfileFormSchema>
export type ChangePasswordFormInput = z.input<typeof ChangePasswordFormSchema>
export type DeleteAccountFormInput = z.input<typeof DeleteAccountFormSchema>
export type DeleteAccountFormOutput = z.output<typeof DeleteAccountFormSchema>
