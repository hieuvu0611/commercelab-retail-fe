'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import { storefrontApi } from '@/services/api/clients'
import {
  ProfileFormSchema,
  type ProfileFormInput,
  type ProfileFormOutput,
} from '@/validations/account'

interface Profile {
  id: string
  name: string
  email: string
  phone?: string
}

const PROFILE_KEY = ['profile'] as const

function failureMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    (error.status === 503 || error.kind === 'network' || error.kind === 'timeout')
  ) {
    return 'Your details are temporarily unavailable. Please try again shortly.'
  }
  return 'We could not save your details. Please try again.'
}

export function ProfileForm() {
  const { data: session, status, update } = useSession()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => (await storefrontApi.get<Profile>('/auth/me')).data,
    enabled: status === 'authenticated' && Boolean(session?.accessToken),
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormInput, unknown, ProfileFormOutput>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: { fullName: '', phone: '' },
  })

  useEffect(() => {
    if (profile.data) reset({ fullName: profile.data.name, phone: profile.data.phone ?? '' })
  }, [profile.data, reset])

  async function onSubmit(values: ProfileFormOutput) {
    setFormError(undefined)
    setSaved(false)
    try {
      const { data } = await storefrontApi.patch<Profile>('/auth/me', values, {
        skipUnauthorizedHandler: true,
      })
      queryClient.setQueryData(PROFILE_KEY, data)
      // Refresh the name shown in the header without signing in again.
      await update({ name: data.name, phone: data.phone ?? '' })
      setSaved(true)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const fullName = error.fieldErrors.fullName?.[0]
        const phone = error.fieldErrors.phone?.[0]
        if (fullName) setError('fullName', { message: fullName })
        if (phone) setError('phone', { message: phone })
        if (fullName || phone) return
      }
      setFormError(failureMessage(error))
    }
  }

  if (profile.isError) {
    return <FormAlert message="We could not load your details. Please reload the page." />
  }
  if (!profile.data) {
    return (
      <p role="status" className="mt-8 text-ink-2">
        Loading your details…
      </p>
    )
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="mt-8 flex max-w-[28rem] flex-col gap-5"
      aria-busy={isSubmitting}
    >
      <FormAlert message={formError} />
      {saved && (
        <p
          role="status"
          className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          Your details were saved.
        </p>
      )}
      <TextField
        label="Email"
        type="email"
        value={profile.data.email}
        readOnly
        hint="Your email is your sign-in name and cannot be changed."
      />
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        hint="International format, for example +84901234567."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <button type="submit" disabled={isSubmitting} className="btn btn-primary self-start">
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
