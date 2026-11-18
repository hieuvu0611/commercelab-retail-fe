import { getAccessToken } from '@/auth/access-token'
import { createSseParser } from '@/fulfillment/sse-parser'
import { listMockNotifications, markAllMockNotificationsAsRead, markMockNotificationAsRead } from './mock-notifications'
import type { NotificationItem, NotificationsResponse } from './types'

export const NOTIFICATIONS_KEY = (recipientId: string) => ['notifications', recipientId] as const

const STREAM_IDLE_MS = 45_000
const STREAM_BASE_WAIT_MS = 1_000
const STREAM_MAX_WAIT_MS = 30_000

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

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchNotifications(recipientId: string): Promise<NotificationsResponse> {
  if (isMockMode()) {
    return listMockNotifications(recipientId)
  }

  const base = notificationBaseUrl()
  const res = await fetch(`${base}/api/v1/notifications/${encodeURIComponent(recipientId)}`, {
    headers: authHeaders(),
  })
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
    { method: 'PATCH', headers: authHeaders() }
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
    { method: 'PATCH', headers: authHeaders() }
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

export interface NotificationStreamOptions {
  url: string
  getToken: () => string | null
  onNotification: (item: NotificationItem) => void
  onError?: () => void
  fetchImpl?: typeof fetch
}

/**
 * Opens an authenticated notification SSE stream over fetch + ReadableStream because browser
 * EventSource cannot attach Bearer Authorization headers. Reconnects with exponential backoff.
 */
export function startNotificationStream(options: NotificationStreamOptions): () => void {
  const { url, getToken, onNotification, onError, fetchImpl = fetch } = options
  let stopped = false
  let attempt = 0
  let controller: AbortController | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  async function connectOnce(): Promise<void> {
    controller = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const token = getToken()
      if (!token) throw new Error('missing access token for notification stream')
      const res = await fetchImpl(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok || !res.body) throw new Error(`notification stream refused: ${res.status}`)
      attempt = 0

      reader = res.body.getReader()
      const active = reader
      const decoder = new TextDecoder()
      const parse = createSseParser()
      const resetIdle = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          controller?.abort()
          void active.cancel().catch(() => undefined)
        }, STREAM_IDLE_MS)
      }
      resetIdle()
      while (!stopped) {
        const { done, value } = await active.read()
        if (done) break
        resetIdle()
        for (const msg of parse(decoder.decode(value, { stream: true }))) {
          if (stopped || msg.event !== 'notification') continue
          try {
            onNotification(JSON.parse(msg.data) as NotificationItem)
          } catch {
            onError?.()
          }
        }
      }
    } catch {
      if (!stopped) onError?.()
    } finally {
      clearTimeout(idleTimer)
      reader = null
      controller = null
    }

    if (stopped) return
    const waitMs = Math.min(STREAM_MAX_WAIT_MS, STREAM_BASE_WAIT_MS * 2 ** Math.min(attempt, 5))
    attempt += 1
    retryTimer = setTimeout(() => {
      if (!stopped) void connectOnce()
    }, waitMs)
  }

  void connectOnce()

  return () => {
    stopped = true
    clearTimeout(retryTimer)
    controller?.abort()
    void reader?.cancel().catch(() => undefined)
  }
}
