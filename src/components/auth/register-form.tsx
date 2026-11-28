'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useForm, type Path } from 'react-hook-form'
import { TextField } from '@/components/forms/text-field'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { useI18n, type MessageKey } from '@/i18n'
import { safeCallbackUrl } from '@/utils/safe-redirect'
import {
  RegisterFormSchema,
  type RegisterFormInput,
  type RegisterFormOutput,
} from '@/validations/auth'
import { FormAlert } from './form-alert'

const SERVER_FIELDS: ReadonlyArray<Path<RegisterFormInput>> = ['fullName', 'email', 'password']

interface ServerAnswer {
  code?: string
  fieldErrors?: Record<string, string[]>
}

const MESSAGE_KEYS: Record<string, MessageKey> = {
  TOO_MANY_ATTEMPTS: 'auth.error.tooManyRegisterAttempts',
  SERVICE_UNAVAILABLE: 'auth.error.registerUnavailable',
}

interface RegisterFormProps {
  callbackUrl: string
  loginHref: string
}

export function RegisterForm({ callbackUrl, loginHref }: RegisterFormProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, unknown, RegisterFormOutput>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  })

  async function onSubmit(values: RegisterFormOutput) {
    setFormError(undefined)
    // The app's own server registers the account, so the session the identity service starts for it (and its
    // refresh token) never reaches this page.
    const response = await fetch('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      }),
    }).catch(() => undefined)
    const answer: ServerAnswer = (await response?.json().catch(() => undefined)) ?? {}

    if (!response?.ok) {
      if (answer.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('email', {
          message: t('auth.error.emailExists'),
        })
        return
      }
      let placed = false
      for (const field of SERVER_FIELDS) {
        const message = answer.fieldErrors?.[field]?.[0]
        if (message) {
          setError(field, { message })
          placed = true
        }
      }
      if (placed) return
      const key =
        MESSAGE_KEYS[answer.code ?? ''] ??
        (response ? 'auth.error.registerFallback' : 'auth.error.registerUnavailable')
      setFormError(t(key))
      return
    }

    // The account exists; sign in with the same credentials so NextAuth creates the session.
    const result = await signIn('credentials', {
      redirect: false,
      email: values.email,
      password: values.password,
    })
    if (!result || result.error || !result.ok) {
      setFormError(t('auth.error.createdSignInFailed'))
      return
    }
    router.push(safeCallbackUrl(callbackUrl))
    router.refresh()
  }

  return (
    <section className="max-w-[28rem] border-t-4 border-ink pt-6">
      <h1 className="text-3xl">{t('auth.createYourAccount')}</h1>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField
          label={t('auth.fullName')}
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
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
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label={t('auth.repeatPassword')}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccountButton')}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        {t('auth.alreadyHaveAccount')}{' '}
        <Link href={loginHref || STOREFRONT_ROUTES.login}>{t('auth.signInButton')}</Link>
      </p>
    </section>
  )
}
