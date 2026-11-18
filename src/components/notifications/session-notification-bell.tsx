'use client'

import { useSession } from 'next-auth/react'
import { NotificationBell } from './notification-bell'

/** Renders the notification bell only for an authenticated session user; never falls back to sample IDs. */
export function SessionNotificationBell() {
  const { data: session, status } = useSession()
  const recipientId =
    status === 'authenticated' && !session?.error ? session?.user?.id : undefined

  if (!recipientId) return null
  return <NotificationBell recipientId={recipientId} />
}
