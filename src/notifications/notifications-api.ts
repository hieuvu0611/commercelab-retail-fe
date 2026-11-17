import { listMockNotifications, markAllMockNotificationsAsRead, markMockNotificationAsRead } from './mock-notifications'
import type { NotificationsResponse } from './types'

export const NOTIFICATIONS_KEY = (recipientId: string) => ['notifications', recipientId] as const

function notificationBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const gateway = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  if (gateway) return gateway.replace(/\/api\/v1\/?$/, '')
  return ''
}

function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || typeof window === 'undefined'
}

export async function fetchNotifications(recipientId: string): Promise<NotificationsResponse> {
  if (isMockMode()) {
    return listMockNotifications(recipientId)
  }

  const base = notificationBaseUrl()
  const res = await fetch(`${base}/api/v1/notifications/${encodeURIComponent(recipientId)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch notifications (${res.status})`)
  }
  const data = await res.json()
  return {
    items: data.data?.items ?? [],
    unreadCount: data.data?.unreadCount ?? 0,
  }
}

export async function markNotificationAsRead(recipientId: string, notificationId: string): Promise<boolean> {
  if (isMockMode()) {
    return markMockNotificationAsRead(recipientId, notificationId)
  }

  const base = notificationBaseUrl()
  const res = await fetch(
    `${base}/api/v1/notifications/${encodeURIComponent(recipientId)}/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH' }
  )
  if (!res.ok) {
    throw new Error(`Failed to mark notification read (${res.status})`)
  }
  return true
}

export async function markAllNotificationsAsRead(recipientId: string): Promise<number> {
  if (isMockMode()) {
    return markAllMockNotificationsAsRead(recipientId)
  }

  const base = notificationBaseUrl()
  const res = await fetch(
    `${base}/api/v1/notifications/${encodeURIComponent(recipientId)}/read-all`,
    { method: 'PATCH' }
  )
  if (!res.ok) {
    throw new Error(`Failed to mark all notifications read (${res.status})`)
  }
  const data = await res.json()
  return data.data?.updatedCount ?? 0
}

export function getNotificationStreamUrl(recipientId: string): string {
  const base = notificationBaseUrl()
  return `${base}/api/v1/notifications/${encodeURIComponent(recipientId)}/stream`
}
