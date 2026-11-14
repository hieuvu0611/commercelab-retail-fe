import { z } from 'zod'
import { ROLE_OPTIONS } from '@/configs/roles'

// Mirrors the identity service (P1-T09); the server stays the authority.
const MIN_REASON = 3
const MAX_REASON = 500
const KNOWN_ROLES = new Set(ROLE_OPTIONS.map((option) => option.value))

const reasonField = z
  .string()
  .trim()
  .min(MIN_REASON, 'Give a reason of at least 3 characters')
  .max(MAX_REASON, 'The reason must be at most 500 characters')

const grantsField = z
  .array(z.object({ role: z.string(), warehouseId: z.string().optional() }))
  .min(1, 'Choose at least one role')
  .refine(
    (grants) => grants.every((grant) => KNOWN_ROLES.has(grant.role)),
    'Choose roles from the list'
  )

export const RolesFormSchema = z.object({ roles: grantsField, reason: reasonField })

export const DeactivateFormSchema = z.object({ reason: reasonField })

export const CreateStaffFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter the full name')
    .max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter the email address')
    .email('Enter a valid email address')
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(10, 'The initial password must be at least 10 characters')
    .max(128, 'The initial password must be at most 128 characters'),
  roles: grantsField,
  reason: reasonField,
})

export type RolesFormInput = z.input<typeof RolesFormSchema>
export type DeactivateFormInput = z.input<typeof DeactivateFormSchema>
export type CreateStaffFormInput = z.input<typeof CreateStaffFormSchema>
export type CreateStaffFormOutput = z.output<typeof CreateStaffFormSchema>
