'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import type { AddressInput } from '@/types/checkout'
import {
  AddressFormSchema,
  type AddressFormInput,
  type AddressFormOutput,
} from '@/validations/address'

const FIELDS = ['recipient', 'phone', 'line1', 'ward', 'district', 'province'] as const

const EMPTY: AddressFormInput = {
  recipient: '',
  phone: '',
  line1: '',
  ward: '',
  district: '',
  province: '',
  isDefault: false,
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'ADDRESS_LIMIT_REACHED')
    return 'You have reached the limit of saved addresses. Delete one first.'
  if (error instanceof ApiError && (error.status === 503 || error.kind === 'network'))
    return 'Your addresses are temporarily unavailable. Please try again shortly.'
  return 'We could not save this address. Please try again.'
}

/** Add or edit one delivery address. The server has the final say on every rule; its field errors are shown here. */
export function AddressForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AddressInput
  submitLabel: string
  onSubmit: (values: AddressInput) => Promise<void>
  onCancel?: () => void
}) {
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormInput, unknown, AddressFormOutput>({
    resolver: zodResolver(AddressFormSchema),
    defaultValues: initial ?? EMPTY,
  })

  async function submit(values: AddressFormOutput) {
    setFormError(undefined)
    try {
      await onSubmit(values)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        let isShown = false
        for (const field of FIELDS) {
          const message = error.fieldErrors[field]?.[0]
          if (message) {
            setError(field, { message })
            isShown = true
          }
        }
        if (isShown) return
      }
      setFormError(failureMessage(error))
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(submit)}
      className="flex max-w-[34rem] flex-col gap-5"
      aria-busy={isSubmitting}
    >
      <FormAlert message={formError} />
      <TextField
        label="Recipient"
        autoComplete="name"
        error={errors.recipient?.message}
        {...register('recipient')}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        hint="International format, for example +84901234567."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Street address"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register('line1')}
      />
      <TextField label="Ward" error={errors.ward?.message} {...register('ward')} />
      <TextField label="District" error={errors.district?.message} {...register('district')} />
      <TextField
        label="Province or city"
        autoComplete="address-level1"
        error={errors.province?.message}
        {...register('province')}
      />
      <label className="flex min-h-11 items-center gap-3 text-ink">
        <input type="checkbox" className="size-5" {...register('isDefault')} />
        <span>Use as my default address</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
