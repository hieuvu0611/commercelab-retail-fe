'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { TextField } from '@/components/forms/text-field'
import { isStaff } from '@/auth/guard'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { useI18n, type MessageKey } from '@/i18n'
import { safeCallbackUrl } from '@/utils/safe-redirect'
import { LoginFormSchema, type LoginFormInput } from '@/validations/auth'
import { FormAlert } from './form-alert'

const ERROR_MESSAGE_KEYS: Record<string, MessageKey> = {
  CredentialsSignin: 'auth.error.credentials',
  TOO_MANY_ATTEMPTS: 'auth.error.tooManyLoginAttempts',
  SERVICE_UNAVAILABLE: 'auth.error.loginUnavailable',
}

interface LoginFormProps {
  /** Where to go after signing in (already validated by the page). */
  callbackUrl: string
  /** The sign-in route this form is on, so "create account" keeps the callbackUrl. */
  registerHref?: string
  /** Staff sign-in uses the same flow with different words. */
  heading?: string
  submitLabel?: string
  /** Staff sign-in: an account without a staff role is signed out again with an explanation. */
  requireStaff?: boolean
  statusMessage?: string
}

export function LoginForm({
  callbackUrl,
  registerHref,
  heading,
  submitLabel,
  requireStaff = false,
  statusMessage,
}: LoginFormProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [formError, setFormError] = useState<string>()
  const resolvedHeading =
    heading ?? (requireStaff ? t('auth.staffSignInHeading') : t('auth.signInHeading'))
  const resolvedSubmitLabel = submitLabel ?? t('auth.signInButton')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginFormInput) {
    setFormError(undefined)
    const result = await signIn('credentials', {
      redirect: false,
      email: values.email,
      password: values.password,
    })
    if (!result || result.error || !result.ok) {
      const key = ERROR_MESSAGE_KEYS[result?.error ?? ''] ?? 'auth.error.loginFallback'
      setFormError(t(key))
      return
    }
    if (requireStaff) {
      const current = await getSession()
      if (!isStaff(current?.user)) {
        await signOut({ redirect: false })
        setFormError(t('auth.error.notStaff'))
        return
      }
    }
    router.push(safeCallbackUrl(callbackUrl))
    router.refresh()
  }

  return (
    <section className="max-w-[28rem] border-t-4 border-ink pt-6">
      <h1 className="text-3xl">{resolvedHeading}</h1>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        {statusMessage && (
          <p
            role="status"
            className="border-l-4 border-ink bg-paper-2 px-4 py-3 text-sm text-ink"
          >
            {statusMessage}
          </p>
        )}
        <FormAlert message={formError} />
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? t('auth.signingIn') : resolvedSubmitLabel}
        </button>
      </form>
      {registerHref !== undefined && (
        <p className="mt-6 text-sm text-ink-2">
          {t('auth.newHere')}{' '}
          <Link href={registerHref || STOREFRONT_ROUTES.register}>{t('auth.createAnAccount')}</Link>
        </p>
      )}
    </section>
  )
}
