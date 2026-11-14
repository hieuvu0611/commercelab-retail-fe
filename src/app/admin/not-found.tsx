import Link from 'next/link'
import { StatusMessage } from '@/components/layout/status-message'
import { ADMIN_HOME } from '@/configs/navigation'

export default function AdminNotFound() {
  return (
    <StatusMessage
      title="Page not found"
      description="This backoffice page does not exist yet, or the address is wrong."
      actions={
        <Link href={ADMIN_HOME} className="btn btn-primary">
          Back to overview
        </Link>
      }
    />
  )
}
