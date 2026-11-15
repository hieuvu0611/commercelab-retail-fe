import { z } from 'zod'

// Mirrors the voucher admin API (P4-T04); the server stays the authority.
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/
const MAX_NAME_LENGTH = 100
const MAX_DISCOUNT_PCT = 100

const wholeNumber = (label: string, min: number, max?: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .transform(Number)
    .refine((value) => value >= min, `${label} must be at least ${min}`)
    .refine((value) => max === undefined || value <= max, `${label} must be at most ${max}`)

export const VoucherFormSchema = z
  .object({
    // Typing lower case is fine: codes are stored upper case.
    code: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine(
        (value) => CODE_PATTERN.test(value),
        'Use 3 to 32 letters, digits, hyphens or underscores'
      ),
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`),
    discountPct: wholeNumber('Discount', 1, MAX_DISCOUNT_PCT),
    totalQuota: wholeNumber('Quota', 1),
    perCustomerLimit: wholeNumber('Limit per customer', 1),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be after the start',
      })
    }
  })

export type VoucherFormInput = z.input<typeof VoucherFormSchema>
export type VoucherFormOutput = z.output<typeof VoucherFormSchema>
