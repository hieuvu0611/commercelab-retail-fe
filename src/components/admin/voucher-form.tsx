'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import { fromLocalInput, toLocalInput } from '@/vouchers/adapters'
import type { VoucherCampaign, VoucherCampaignInput } from '@/types/voucher'
import {
  VoucherFormSchema,
  type VoucherFormInput,
  type VoucherFormOutput,
} from '@/validations/voucher'

const FIELDS = [
  'code',
  'name',
  'discountPct',
  'totalQuota',
  'perCustomerLimit',
  'startsAt',
  'endsAt',
] as const

const EMPTY: VoucherFormInput = {
  code: '',
  name: '',
  discountPct: '10',
  totalQuota: '100',
  perCustomerLimit: '1',
  startsAt: '',
  endsAt: '',
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return 'You do not have permission to change vouchers.'
  if (error instanceof ApiError && (error.status === 503 || error.kind === 'network'))
    return 'Vouchers are temporarily unavailable. Please try again shortly.'
  return 'We could not save this voucher. Please try again.'
}

/** Create a campaign, or edit one (the code and, once the voucher is in use, the discount are fixed). */
export function VoucherForm({
  campaign,
  onSubmit,
  onCancel,
}: {
  campaign?: VoucherCampaign
  onSubmit: (input: VoucherCampaignInput) => Promise<void>
  onCancel: () => void
}) {
  const [formError, setFormError] = useState<string>()
  const isUsed = campaign ? campaign.reservedQuota + campaign.consumedQuota > 0 : false
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VoucherFormInput, unknown, VoucherFormOutput>({
    resolver: zodResolver(VoucherFormSchema),
    defaultValues: campaign
      ? {
          code: campaign.code,
          name: campaign.name,
          discountPct: String(campaign.discountPct),
          totalQuota: String(campaign.totalQuota),
          perCustomerLimit: String(campaign.perCustomerLimit),
          startsAt: toLocalInput(campaign.startsAt),
          endsAt: toLocalInput(campaign.endsAt),
        }
      : EMPTY,
  })

  async function submit(values: VoucherFormOutput) {
    setFormError(undefined)
    try {
      await onSubmit({
        ...values,
        startsAt: fromLocalInput(values.startsAt),
        endsAt: fromLocalInput(values.endsAt),
        status: campaign?.status ?? 'ACTIVE',
      })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VOUCHER_CODE_EXISTS') {
        setError('code', { message: 'A voucher with this code already exists' })
        return
      }
      if (error instanceof ApiError && error.code === 'VOUCHER_IN_USE') {
        setError('discountPct', {
          message: 'The discount cannot change once the voucher has been reserved or used',
        })
        return
      }
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
      className="mt-4 flex flex-col gap-5"
      aria-busy={isSubmitting}
    >
      <FormAlert message={formError} />
      <TextField
        label="Code"
        autoCapitalize="characters"
        autoComplete="off"
        readOnly={Boolean(campaign)}
        hint={campaign ? 'The code cannot be changed.' : 'Letters, digits, hyphens or underscores.'}
        error={errors.code?.message}
        {...register('code')}
      />
      <TextField label="Name" error={errors.name?.message} {...register('name')} />
      <TextField
        label="Discount (%)"
        inputMode="numeric"
        readOnly={isUsed}
        hint={
          isUsed
            ? 'The discount cannot change once the voucher has been reserved or used.'
            : 'Whole percent from 1 to 100. Applies to goods, never to shipping.'
        }
        error={errors.discountPct?.message}
        {...register('discountPct')}
      />
      <TextField
        label="Total quota"
        inputMode="numeric"
        hint={
          campaign
            ? `At least ${campaign.reservedQuota + campaign.consumedQuota} (already reserved or used).`
            : 'How many orders can use this voucher in total.'
        }
        error={errors.totalQuota?.message}
        {...register('totalQuota')}
      />
      <TextField
        label="Limit per customer"
        inputMode="numeric"
        error={errors.perCustomerLimit?.message}
        {...register('perCustomerLimit')}
      />
      <TextField
        label="Starts (optional)"
        type="datetime-local"
        hint="Leave empty to start at once."
        error={errors.startsAt?.message}
        {...register('startsAt')}
      />
      <TextField
        label="Ends (optional)"
        type="datetime-local"
        hint="Leave empty for no end date."
        error={errors.endsAt?.message}
        {...register('endsAt')}
      />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? 'Saving…' : campaign ? 'Save changes' : 'Create voucher'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
