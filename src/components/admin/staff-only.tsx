'use client'

import { useSession } from 'next-auth/react'
import type { ReactNode } from 'react'
import { roleLabel } from '@/configs/roles'

/** Renders children only for users holding `role`; everyone else sees a plain explanation. */
export function StaffOnly({
  role,
  what,
  children,
}: {
  role: string
  /** What the role allows, for the message: "manage categories". */
  what: string
  children: ReactNode
}) {
  const { data: session, status } = useSession()
  if (status === 'loading') {
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading…
      </p>
    )
  }
  if (!session?.user?.roles.includes(role)) {
    return (
      <div className="mt-6 max-w-[40rem] border-t border-rule-2 bg-paper-2 px-6 py-8">
        <p className="font-label text-lg text-ink">You don&apos;t have permission to {what}</p>
        <p className="mt-2 max-w-[52ch] text-ink-2">
          This area is for the {roleLabel(role).toLowerCase()} role. Ask an access administrator if
          you need it.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
