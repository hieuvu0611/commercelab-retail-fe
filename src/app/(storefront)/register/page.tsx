import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/register-form'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { safeCallbackUrl } from '@/utils/safe-redirect'

export const metadata: Metadata = {
  title: 'Create account — CommerceLab Retail',
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const target = safeCallbackUrl(callbackUrl)
  const loginHref =
    target === '/'
      ? STOREFRONT_ROUTES.login
      : `${STOREFRONT_ROUTES.login}?callbackUrl=${encodeURIComponent(target)}`
  return <RegisterForm callbackUrl={target} loginHref={loginHref} />
}
