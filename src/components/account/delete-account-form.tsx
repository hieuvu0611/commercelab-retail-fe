'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { getSession, signOut, useSession } from 'next-auth/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { isStaff } from '@/auth/guard'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import {
  DeleteAccountFormSchema,
  type DeleteAccountFormInput,
  type DeleteAccountFormOutput,
} from '@/validations/account'

interface ServerAnswer {
  code?: string
  fieldErrors?: Record<string, string[]>
}

const MESSAGES: Record<string, string> = {
  STAFF_ACCOUNT_CANNOT_SELF_DELETE:
    'Staff accounts cannot be self-deleted. Ask an access administrator to deactivate your account.',
  TOO_MANY_ATTEMPTS: 'Too many failed attempts. Wait a few minutes and try again.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  SERVICE_UNAVAILABLE:
    'Deleting your account is temporarily unavailable. Please try again shortly.',
}
const FALLBACK = 'We could not delete your account. Please try again.'

export function DeleteAccountForm() {
  const { data: session } = useSession()
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountFormInput, unknown, DeleteAccountFormOutput>({
    resolver: zodResolver(DeleteAccountFormSchema),
    defaultValues: { currentPassword: '', confirmation: '' },
  })

  if (isStaff(session?.user)) {
    return (
      <section aria-labelledby="delete-account-heading" className="max-w-[28rem]">
        <h2 id="delete-account-heading" className="text-xl text-ink">
          Delete account
        </h2>
        <p
          role="status"
          className="mt-4 border-l-4 border-ink bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          Staff accounts cannot be self-deleted. Contact an access administrator to deactivate your
          account.
        </p>
      </section>
    )
  }

  async function onSubmit(values: DeleteAccountFormOutput) {
    setFormError(undefined)

    // Reading the session first lets the app renew an access token that is about to expire.
    await getSession()
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        confirmation: values.confirmation,
      }),
    }).catch(() => undefined)
    const answer: ServerAnswer = (await response?.json().catch(() => undefined)) ?? {}

    if (!response?.ok) {
      if (answer.code === 'INVALID_CURRENT_PASSWORD') {
        setError('currentPassword', { message: 'The current password is not correct.' })
      } else if (answer.fieldErrors?.confirmation?.[0]) {
        setError('confirmation', { message: answer.fieldErrors.confirmation[0] })
      } else if (answer.fieldErrors?.currentPassword?.[0]) {
        setError('currentPassword', { message: answer.fieldErrors.currentPassword[0] })
      } else {
        setFormError(
          MESSAGES[answer.code ?? ''] ?? (response ? FALLBACK : MESSAGES.SERVICE_UNAVAILABLE)
        )
      }
      return
    }

    await signOut({ callbackUrl: '/login?deleted=1' })
  }

  return (
    <section aria-labelledby="delete-account-heading" className="max-w-[28rem]">
      <h2 id="delete-account-heading" className="text-xl text-ink">
        Delete account
      </h2>
      <div className="mt-4 border-l-4 border-ink bg-paper-2 px-4 py-3 text-sm text-ink-2">
        <p className="font-label text-ink">This action is permanent and cannot be undone.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Your name, email address, phone number, and saved addresses will be anonymized and you
            will no longer be able to sign in.
          </li>
          <li>
            Your order history and financial ledger records are retained for 10 years without your
            personal contact details to meet accounting and legal obligations.
          </li>
          <li>You will be signed out of all devices immediately.</li>
        </ul>
      </div>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-5 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <TextField
          label="Type DELETE to confirm"
          type="text"
          autoComplete="off"
          error={errors.confirmation?.message}
          {...register('confirmation')}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary self-start bg-error text-white"
        >
          {isSubmitting ? 'Deleting…' : 'Delete account'}
        </button>
      </form>
    </section>
  )
}
