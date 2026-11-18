'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAccessToken } from '@/auth/access-token'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATIONS_KEY,
  startNotificationStream,
} from './notifications-api'
import { subscribeMockNotifications } from './mock-notifications'
import type { NotificationItem } from './types'

export function useNotifications(recipientId: string | undefined) {
  const queryClient = useQueryClient()
  const id = recipientId || 'guest'

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY(id),
    queryFn: () => fetchNotifications(id),
    enabled: Boolean(recipientId),
    staleTime: 10_000,
  })

  // SSE subscription for live events
  useEffect(() => {
    if (!recipientId) return

    const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

    if (isMock) {
      // In mock mode, subscribe to in-memory event emitter
      const unsub = subscribeMockNotifications(recipientId, (newItem: NotificationItem) => {
        queryClient.setQueryData(
          NOTIFICATIONS_KEY(recipientId),
          (prev: { items: NotificationItem[]; unreadCount: number } | undefined) => {
            if (!prev) return { items: [newItem], unreadCount: 1 }
            return {
              items: [newItem, ...prev.items.filter((i) => i.notificationId !== newItem.notificationId)],
              unreadCount: prev.unreadCount + 1,
            }
          }
        )
      })
      return unsub
    }

    // In live mode, connect to backend SSE stream using fetch + Bearer token
    const url = getNotificationStreamUrl(recipientId)
    if (!url || typeof fetch === 'undefined') return

    return startNotificationStream({
      url,
      getToken: getAccessToken,
      onNotification: (item) => {
        queryClient.setQueryData(
          NOTIFICATIONS_KEY(recipientId),
          (prev: { items: NotificationItem[]; unreadCount: number } | undefined) => {
            if (!prev) return { items: [item], unreadCount: 1 }
            return {
              items: [item, ...prev.items.filter((i) => i.notificationId !== item.notificationId)],
              unreadCount: prev.unreadCount + 1,
            }
          }
        )
      },
      onError: () => {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(recipientId) })
      },
    })
  }, [recipientId, queryClient])

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationAsRead(id, notificationId),
    onSuccess: (_, notificationId) => {
      queryClient.setQueryData(
        NOTIFICATIONS_KEY(id),
        (prev: { items: NotificationItem[]; unreadCount: number } | undefined) => {
          if (!prev) return { items: [], unreadCount: 0 }
          const items = prev.items.map((i) =>
            i.notificationId === notificationId ? { ...i, isRead: true } : i
          )
          const unreadCount = items.filter((i) => !i.isRead).length
          return { items, unreadCount }
        }
      )
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsAsRead(id),
    onSuccess: () => {
      queryClient.setQueryData(
        NOTIFICATIONS_KEY(id),
        (prev: { items: NotificationItem[]; unreadCount: number } | undefined) => {
          if (!prev) return { items: [], unreadCount: 0 }
          const items = prev.items.map((i) => ({ ...i, isRead: true }))
          return { items, unreadCount: 0 }
        }
      )
    },
  })

  return {
    items: query.data?.items ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    markAsRead: (notificationId: string) => markReadMutation.mutate(notificationId),
    markAllAsRead: () => markAllReadMutation.mutate(),
  }
}
