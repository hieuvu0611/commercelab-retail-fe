'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, type Path } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import {
  CreateStaffFormSchema,
  DeactivateFormSchema,
  RolesFormSchema,
  type CreateStaffFormInput,
  type CreateStaffFormOutput,
  type DeactivateFormInput,
  type RolesFormInput,
} from '@/validations/admin'
import { RolePicker, type GrantValue } from './role-picker'

export interface AdminUser {
  id: string
  email: string
  fullName: string
  phone?: string
  isActive: boolean
  roles: GrantValue[]
}

const GENERIC_ERROR = 'We could not complete this change. Please try again.'

/** Plain-words message for a failed administration call. */
export function adminFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CANNOT_MODIFY_OWN_ACCESS')
      return "You can't change your own access. Ask another administrator."
    if (error.status === 403) return 'You do not have permission to do this.'
    if (error.status === 404) return 'This user no longer exists. Reload the list.'
    if (error.status === 429) return 'Too many attempts. Wait a few minutes and try again.'
    if (error.status === 503 || error.kind === 'network' || error.kind === 'timeout') {
      return 'This is temporarily unavailable. Please try again shortly.'
    }
  }
  return GENERIC_ERROR
}

interface PanelProps<T> {
  title: string
  submitLabel: string
  busyLabel: string
  onSubmit: (values: T) => Promise<void>
  onCancel: () => void
}

function Panel({
  title,
  children,
  onCancel,
}: {
  title: string
  children: React.ReactNode
  onCancel: () => void
}) {
  return (
    <section
      aria-label={title}
      className="mt-8 max-w-[34rem] border-t-4 border-ink bg-paper-2 px-6 py-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="font-label min-h-11 text-sm text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {children}
    </section>
  )
}

// Applies server field errors to the matching form fields; returns true when at least one was placed.
function placeServerErrors<T extends Record<string, unknown>>(
  error: unknown,
  fields: ReadonlyArray<Path<T>>,
  setError: (name: Path<T>, error: { message: string }) => void
): boolean {
  if (!(error instanceof ApiError)) return false
  let placed = false
  for (const field of fields) {
    const message = error.fieldErrors[field as string]?.[0]
    if (message) {
      setError(field, { message })
      placed = true
    }
  }
  return placed
}

export function CreateStaffPanel({
  title,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: PanelProps<CreateStaffFormOutput>) {
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffFormInput, unknown, CreateStaffFormOutput>({
    resolver: zodResolver(CreateStaffFormSchema),
    defaultValues: { fullName: '', email: '', password: '', roles: [], reason: '' },
  })

  async function submit(values: CreateStaffFormOutput) {
    setFormError(undefined)
    try {
      await onSubmit(values)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('email', { message: 'An account with this email already exists.' })
        return
      }
      if (
        placeServerErrors<CreateStaffFormInput>(
          error,
          ['fullName', 'email', 'password', 'roles', 'reason'],
          setError
        )
      )
        return
      setFormError(adminFailureMessage(error))
    }
  }

  return (
    <Panel title={title} onCancel={onCancel}>
      <form
        noValidate
        onSubmit={handleSubmit(submit)}
        className="mt-4 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField
          label="Full name"
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Initial password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters. Share it securely; the person should change it after signing in."
          error={errors.password?.message}
          {...register('password')}
        />
        <Controller
          control={control}
          name="roles"
          render={({ field }) => (
            <RolePicker
              value={field.value as GrantValue[]}
              onChange={field.onChange}
              error={errors.roles?.message}
            />
          )}
        />
        <TextField
          label="Reason"
          hint="Recorded in the audit log."
          error={errors.reason?.message}
          {...register('reason')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? busyLabel : submitLabel}
        </button>
      </form>
    </Panel>
  )
}

export function EditRolesPanel({
  user,
  onSubmit,
  onCancel,
}: {
  user: AdminUser
  onSubmit: (values: RolesFormInput) => Promise<void>
  onCancel: () => void
}) {
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RolesFormInput>({
    resolver: zodResolver(RolesFormSchema),
    defaultValues: { roles: user.roles, reason: '' },
  })

  async function submit(values: RolesFormInput) {
    setFormError(undefined)
    try {
      await onSubmit(values)
    } catch (error) {
      if (placeServerErrors<RolesFormInput>(error, ['roles', 'reason'], setError)) return
      setFormError(adminFailureMessage(error))
    }
  }

  return (
    <Panel title={`Change roles for ${user.fullName}`} onCancel={onCancel}>
      <p className="mt-2 text-sm text-ink-2">
        {user.email}. They are signed out and get the new roles when they sign in again.
      </p>
      <form
        noValidate
        onSubmit={handleSubmit(submit)}
        className="mt-4 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <Controller
          control={control}
          name="roles"
          render={({ field }) => (
            <RolePicker
              value={field.value as GrantValue[]}
              onChange={field.onChange}
              error={errors.roles?.message}
            />
          )}
        />
        <TextField
          label="Reason"
          hint="Recorded in the audit log."
          error={errors.reason?.message}
          {...register('reason')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? 'Saving…' : 'Save roles'}
        </button>
      </form>
    </Panel>
  )
}

export function DeactivatePanel({
  user,
  onSubmit,
  onCancel,
}: {
  user: AdminUser
  onSubmit: (values: DeactivateFormInput) => Promise<void>
  onCancel: () => void
}) {
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeactivateFormInput>({
    resolver: zodResolver(DeactivateFormSchema),
    defaultValues: { reason: '' },
  })

  async function submit(values: DeactivateFormInput) {
    setFormError(undefined)
    try {
      await onSubmit(values)
    } catch (error) {
      if (placeServerErrors<DeactivateFormInput>(error, ['reason'], setError)) return
      setFormError(adminFailureMessage(error))
    }
  }

  return (
    <Panel title={`Deactivate ${user.fullName}`} onCancel={onCancel}>
      <p className="mt-2 text-sm text-ink-2">
        {user.email} will be signed out everywhere and can no longer sign in. This is recorded in
        the audit log.
      </p>
      <form
        noValidate
        onSubmit={handleSubmit(submit)}
        className="mt-4 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField label="Reason" error={errors.reason?.message} {...register('reason')} />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? 'Deactivating…' : 'Deactivate account'}
        </button>
      </form>
    </Panel>
  )
}
