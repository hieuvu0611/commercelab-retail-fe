import { LoginForm } from '@/components/auth/login-form'
import { ADMIN_HOME } from '@/configs/navigation'
import { safeCallbackUrl } from '@/utils/safe-redirect'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  return (
    <LoginForm
      callbackUrl={safeCallbackUrl(callbackUrl, ADMIN_HOME)}
      heading="Staff sign-in"
      requireStaff
    />
  )
}
