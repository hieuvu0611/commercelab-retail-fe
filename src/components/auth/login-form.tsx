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
import { safeCallbackUrl } from '@/utils/safe-redirect'
import { LoginFormSchema, type LoginFormInput } from '@/validations/auth'
import { FormAlert } from './form-alert'

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'The email or password is not correct.',
  TOO_MANY_ATTEMPTS: 'Too many failed attempts. Wait a few minutes and try again.',
  SERVICE_UNAVAILABLE: 'Sign-in is temporarily unavailable. Please try again shortly.',
}
const FALLBACK_ERROR = 'We could not sign you in. Please try again.'

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
}

export function LoginForm({
  callbackUrl,
  registerHref,
  heading = 'Sign in',
  submitLabel = 'Sign in',
  requireStaff = false,
}: LoginFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
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
      setFormError(ERROR_MESSAGES[result?.error ?? ''] ?? FALLBACK_ERROR)
      return
    }
    if (requireStaff) {
      const current = await getSession()
      if (!isStaff(current?.user)) {
        await signOut({ redirect: false })
        setFormError('This account does not have backoffice access. Sign in with a staff account.')
        return
      }
    }
    router.push(safeCallbackUrl(callbackUrl))
    router.refresh()
  }

  return (
    <section className="max-w-[28rem] border-t-4 border-ink pt-6">
      <h1 className="text-3xl">{heading}</h1>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? 'Signing in…' : submitLabel}
        </button>
      </form>
      {registerHref !== undefined && (
        <p className="mt-6 text-sm text-ink-2">
          New here? <Link href={registerHref || STOREFRONT_ROUTES.register}>Create an account</Link>
        </p>
      )}
    </section>
  )
}
