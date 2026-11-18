import { listExceptionCases } from '@/cases/cases-api'
import { fetchManagementMetrics } from '@/metrics/metrics-api'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  startNotificationStream,
} from '@/notifications/notifications-api'
import { setAccessToken } from '@/auth/access-token'
import { backofficeApi } from '@/services/api/clients'
import type { NotificationItem } from '@/notifications/types'

describe('M0 FE-BE Sync & No Silent Mock Fallbacks', () => {
  const prevMockMode = process.env.NEXT_PUBLIC_MOCK_MODE
  const prevNotiUrl = process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL
  const origFetch = global.fetch

  afterEach(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = prevMockMode
    process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL = prevNotiUrl
    setAccessToken(null)
    global.fetch = origFetch
    jest.restoreAllMocks()
  })

  it('calls /backoffice/exception-cases and propagates errors when NEXT_PUBLIC_MOCK_MODE=false', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
    const spy = jest.spyOn(backofficeApi, 'get').mockRejectedValueOnce(new Error('Network down'))

    await expect(listExceptionCases()).rejects.toThrow('Network down')
    expect(spy).toHaveBeenCalledWith('/backoffice/exception-cases', {
      skipUnauthorizedHandler: true,
      params: undefined,
    })
  })

  it('calls /backoffice/metrics and propagates errors when NEXT_PUBLIC_MOCK_MODE=false', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
    const spy = jest.spyOn(backofficeApi, 'get').mockRejectedValueOnce(new Error('503 Unavailable'))

    await expect(fetchManagementMetrics('7D')).rejects.toThrow('503 Unavailable')
    expect(spy).toHaveBeenCalledWith('/backoffice/metrics', {
      skipUnauthorizedHandler: true,
      params: { period: '7D' },
    })
  })

  it('builds notification stream URL from NEXT_PUBLIC_NOTIFICATION_API_BASE_URL', () => {
    process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL = 'http://localhost:8089/'
    expect(getNotificationStreamUrl('user-lan')).toBe(
      'http://localhost:8089/api/v1/notifications/user-lan/stream'
    )
  })

  it('attaches Bearer token on live notification fetch and mark-read calls', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
    process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL = 'http://localhost:8089'
    setAccessToken('jwt-noti-token')

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: [], unreadCount: 0, updatedCount: 2 } }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await fetchNotifications('user-lan')
    await markNotificationAsRead('user-lan', 'N-1')
    await markAllNotificationsAsRead('user-lan')

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8089/api/v1/notifications/user-lan',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt-noti-token' } })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8089/api/v1/notifications/user-lan/N-1/read',
      expect.objectContaining({ method: 'PATCH', headers: { Authorization: 'Bearer jwt-noti-token' } })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8089/api/v1/notifications/user-lan/read-all',
      expect.objectContaining({ method: 'PATCH', headers: { Authorization: 'Bearer jwt-noti-token' } })
    )
  })

  it('streams notifications with Bearer auth header instead of unauthenticated EventSource', async () => {
    const { TextEncoder, TextDecoder } = await import('node:util')
    const prevDecoder = globalThis.TextDecoder
    globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
    try {
      const encoder = new TextEncoder()
      const payload =
        'event: notification\ndata: {"notificationId":"N-9","eventId":"E-9","recipientId":"u1","channel":"IN_APP","category":"ORDER","title":"Hi","message":"Live","isRead":false,"createdAt":"2026-11-18T00:00:00Z"}\n\n'
      const body = {
        getReader() {
          let done = false
          return {
            read: async () => {
              if (!done) {
                done = true
                return { done: false, value: encoder.encode(payload) }
              }
              return { done: true, value: undefined }
            },
            cancel: async () => undefined,
          }
        },
      }
      const calls: Array<{ url: string; headers: Record<string, string> }> = []
      const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
        return { ok: true, status: 200, body } as unknown as Response
      })

      const received: NotificationItem[] = []
      const stop = startNotificationStream({
        url: 'http://localhost:8089/api/v1/notifications/u1/stream',
        getToken: () => 'stream-jwt',
        onNotification: (item) => received.push(item),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

      for (let i = 0; i < 10; i++) await Promise.resolve()
      stop()

      expect(calls[0].headers.Authorization).toBe('Bearer stream-jwt')
      expect(received).toHaveLength(1)
      expect(received[0].notificationId).toBe('N-9')
    } finally {
      globalThis.TextDecoder = prevDecoder
    }
  })
})
