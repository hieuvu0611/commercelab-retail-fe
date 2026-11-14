'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useForm, type Path } from 'react-hook-form'
import { TextField } from '@/components/forms/text-field'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { ApiError } from '@/services/api/api-error'
import { storefrontApi } from '@/services/api/clients'
import { safeCallbackUrl } from '@/utils/safe-redirect'
import {
  RegisterFormSchema,
  type RegisterFormInput,
  type RegisterFormOutput,
} from '@/validations/auth'
import { FormAlert } from './form-alert'

const SERVER_FIELDS: ReadonlyArray<Path<RegisterFormInput>> = ['fullName', 'email', 'password']

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Wait a few minutes and try again.'
    if (error.status === 503 || error.kind === 'network' || error.kind === 'timeout') {
      return 'Registration is temporarily unavailable. Please try again shortly.'
    }
  }
  return 'We could not create your account. Please try again.'
}

interface RegisterFormProps {
  callbackUrl: string
  loginHref: string
}

export function RegisterForm({ callbackUrl, loginHref }: RegisterFormProps) {
  const router = useRouter()
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
    try {
      await storefrontApi.post(
        '/auth/register',
        { email: values.email, password: values.password, fullName: values.fullName },
        { skipUnauthorizedHandler: true }
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('email', {
          message: 'An account with this email already exists. Sign in instead.',
        })
        return
      }
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        let placed = false
        for (const field of SERVER_FIELDS) {
          const message = error.fieldErrors[field]?.[0]
          if (message) {
            setError(field, { message })
            placed = true
          }
        }
        if (placed) return
      }
      setFormError(messageFor(error))
      return
    }

    // The account exists; sign in with the same credentials so NextAuth creates the session.
    const result = await signIn('credentials', {
      redirect: false,
      email: values.email,
      password: values.password,
    })
    if (!result || result.error || !result.ok) {
      setFormError('Your account was created, but we could not sign you in. Please sign in.')
      return
    }
    router.push(safeCallbackUrl(callbackUrl))
    router.refresh()
  }

  return (
    <section className="max-w-[28rem] border-t-4 border-ink pt-6">
      <h1 className="text-3xl">Create your account</h1>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-5"
        aria-busy={isSubmitting}
      >
        <FormAlert message={formError} />
        <TextField
          label="Full name"
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
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
          autoComplete="new-password"
          hint="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Repeat password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        Already have an account? <Link href={loginHref || STOREFRONT_ROUTES.login}>Sign in</Link>
      </p>
    </section>
  )
}
