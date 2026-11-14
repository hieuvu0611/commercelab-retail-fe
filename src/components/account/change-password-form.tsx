'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { getSession, signIn, useSession } from 'next-auth/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ChangePasswordFormSchema, type ChangePasswordFormInput } from '@/validations/account'

interface ServerAnswer {
  code?: string
  fieldErrors?: Record<string, string[]>
}

const MESSAGES: Record<string, string> = {
  TOO_MANY_ATTEMPTS: 'Too many failed attempts. Wait a few minutes and try again.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  SERVICE_UNAVAILABLE:
    'Changing your password is temporarily unavailable. Please try again shortly.',
}
const FALLBACK = 'We could not change your password. Please try again.'

export function ChangePasswordForm() {
  const { data: session } = useSession()
  const [formError, setFormError] = useState<string>()
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(ChangePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(values: ChangePasswordFormInput) {
    setFormError(undefined)
    setDone(false)

    // Reading the session first lets the app renew an access token that is about to expire.
    await getSession()
    const response = await fetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    }).catch(() => undefined)
    const answer: ServerAnswer = (await response?.json().catch(() => undefined)) ?? {}

    if (!response?.ok) {
      if (answer.code === 'INVALID_CURRENT_PASSWORD') {
        setError('currentPassword', { message: 'The current password is not correct.' })
      } else if (answer.fieldErrors?.newPassword?.[0]) {
        setError('newPassword', { message: answer.fieldErrors.newPassword[0] })
      } else {
        setFormError(
          MESSAGES[answer.code ?? ''] ?? (response ? FALLBACK : MESSAGES.SERVICE_UNAVAILABLE)
        )
      }
      return
    }

    // The server signed every session out, including this one. Sign in again with the new password so this
    // device gets a fresh session (the refresh token never passes through the page).
    const email = session?.user?.email
    const result = email
      ? await signIn('credentials', { redirect: false, email, password: values.newPassword })
      : undefined
    reset()
    if (!result || result.error || !result.ok) {
      setFormError(
        'Your password was changed, but we could not keep you signed in. Please sign in again.'
      )
      return
    }
    setDone(true)
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="mt-8 flex max-w-[28rem] flex-col gap-5"
      aria-busy={isSubmitting}
    >
      <p className="text-ink-2">Changing your password signs you out of every other device.</p>
      <FormAlert message={formError} />
      {done && (
        <p
          role="status"
          className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          Your password was changed. Other devices were signed out.
        </p>
      )}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <TextField
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
        {isSubmitting ? 'Changing…' : 'Change password'}
      </button>
    </form>
  )
}
