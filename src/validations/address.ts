import { z } from 'zod'

// Mirrors the address book rules of the identity service (P4-T02); the server stays the authority.
const MAX_RECIPIENT_LENGTH = 100
const MAX_LINE_LENGTH = 200
const MAX_AREA_LENGTH = 100
const PHONE_SEPARATORS = /[\s().-]/g
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/

const required = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `Must be at most ${max} characters`)

export const AddressFormSchema = z.object({
  recipient: required('the recipient name', MAX_RECIPIENT_LENGTH),
  phone: z
    .string()
    .transform((value) => value.replace(PHONE_SEPARATORS, ''))
    .refine(
      (value) => PHONE_PATTERN.test(value),
      'Enter an international number of 7 to 15 digits'
    ),
  line1: required('the street address', MAX_LINE_LENGTH),
  ward: required('the ward', MAX_AREA_LENGTH),
  district: required('the district', MAX_AREA_LENGTH),
  province: required('the province or city', MAX_AREA_LENGTH),
  isDefault: z.boolean(),
})

export type AddressFormInput = z.input<typeof AddressFormSchema>
export type AddressFormOutput = z.output<typeof AddressFormSchema>
