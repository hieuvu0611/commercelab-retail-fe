import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { safeCallbackUrl } from '@/utils/safe-redirect'

export const metadata: Metadata = {
  title: 'Sign in — CommerceLab Retail',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; deleted?: string }>
}) {
  const { callbackUrl, deleted } = await searchParams
  const target = safeCallbackUrl(callbackUrl)
  const registerHref =
    target === '/'
      ? STOREFRONT_ROUTES.register
      : `${STOREFRONT_ROUTES.register}?callbackUrl=${encodeURIComponent(target)}`
  const statusMessage =
    deleted === '1'
      ? 'Your account was deleted and your personal data has been anonymized.'
      : undefined
  return (
    <LoginForm
      callbackUrl={target}
      registerHref={registerHref}
      statusMessage={statusMessage}
    />
  )
}
