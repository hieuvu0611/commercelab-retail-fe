import { listMockNotifications, markAllMockNotificationsAsRead, markMockNotificationAsRead } from './mock-notifications'
import type { NotificationItem, NotificationsResponse } from './types'

export const NOTIFICATIONS_KEY = (recipientId: string) => ['notifications', recipientId] as const

export async function fetchNotifications(recipientId: string): Promise<NotificationsResponse> {
  const isMock = process.env.NEXT_PUBLIC_MOCK_API === 'true' || typeof window === 'undefined'
  if (isMock) {
    return listMockNotifications(recipientId)
  }

  try {
    const res = await fetch(`/api/v1/notifications/${encodeURIComponent(recipientId)}`)
    if (!res.ok) {
      return listMockNotifications(recipientId)
    }
    const data = await res.json()
    return {
      items: data.data?.items ?? [],
      unreadCount: data.data?.unreadCount ?? 0,
    }
  } catch {
    return listMockNotifications(recipientId)
  }
}

export async function markNotificationAsRead(recipientId: string, notificationId: string): Promise<boolean> {
  const isMock = process.env.NEXT_PUBLIC_MOCK_API === 'true' || typeof window === 'undefined'
  if (isMock) {
    return markMockNotificationAsRead(recipientId, notificationId)
  }

  try {
    const res = await fetch(
      `/api/v1/notifications/${encodeURIComponent(recipientId)}/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    )
    if (res.ok) return true
    return markMockNotificationAsRead(recipientId, notificationId)
  } catch {
    return markMockNotificationAsRead(recipientId, notificationId)
  }
}

export async function markAllNotificationsAsRead(recipientId: string): Promise<number> {
  const isMock = process.env.NEXT_PUBLIC_MOCK_API === 'true' || typeof window === 'undefined'
  if (isMock) {
    return markAllMockNotificationsAsRead(recipientId)
  }

  try {
    const res = await fetch(
      `/api/v1/notifications/${encodeURIComponent(recipientId)}/read-all`,
      { method: 'PATCH' }
    )
    if (res.ok) {
      const data = await res.json()
      return data.data?.updatedCount ?? 0
    }
    return markAllMockNotificationsAsRead(recipientId)
  } catch {
    return markAllMockNotificationsAsRead(recipientId)
  }
}

export function getNotificationStreamUrl(recipientId: string): string {
  const base = process.env.NEXT_PUBLIC_NOTIFICATION_URL || ''
  return `${base}/api/v1/notifications/${encodeURIComponent(recipientId)}/stream`
}
