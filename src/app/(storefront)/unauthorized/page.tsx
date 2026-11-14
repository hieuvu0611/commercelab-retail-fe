import type { Metadata } from 'next'
import Link from 'next/link'
import { StatusMessage } from '@/components/layout/status-message'
import { STOREFRONT_ROUTES } from '@/configs/navigation'

export const metadata: Metadata = {
  title: 'No access — CommerceLab Retail',
}

export default function UnauthorizedPage() {
  return (
    <StatusMessage
      title="You don't have access to this page"
      description="Sign in with a staff account that has permission for this area, or go back to the shop."
      actions={
        <>
          <Link href={STOREFRONT_ROUTES.staffLogin} className="btn btn-primary">
            Staff sign-in
          </Link>
          <Link href={STOREFRONT_ROUTES.home} className="btn btn-secondary">
            Back to the shop
          </Link>
        </>
      }
    />
  )
}
