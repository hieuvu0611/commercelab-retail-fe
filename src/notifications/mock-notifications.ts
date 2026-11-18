import type { NotificationItem } from './types'

export interface MockNotificationState {
  items: Map<string, NotificationItem[]>
  listeners: Map<string, Set<(item: NotificationItem) => void>>
}

let state: MockNotificationState | null = null

export function getMockNotificationState(): MockNotificationState {
  if (!state) {
    state = {
      items: new Map(),
      listeners: new Map(),
    }

    const now = new Date().toISOString()
    // Seed default customer notifications
    state.items.set('user-lan', [
      {
        notificationId: 'NOTI-CUST-001',
        eventId: 'EVT-ORDER-001',
        recipientId: 'user-lan',
        channel: 'IN_APP',
        category: 'ORDER_CONFIRMED',
        title: 'Đơn hàng O-001 đã xác nhận',
        message: 'Kho WH-HCM-01 đang đóng gói 2 Balo City + 1 Bình nước của bạn.',
        isRead: false,
        createdAt: now,
      },
    ])

    // Seed default staff notifications
    state.items.set('staff-user', [
      {
        notificationId: 'NOTI-STAFF-001',
        eventId: 'EVT-STOP-001',
        recipientId: 'staff-user',
        channel: 'IN_APP',
        category: 'WAREHOUSE_STOP_SIGNAL',
        title: 'Cảnh báo: Yêu cầu dừng đóng gói kiện S-001',
        message: 'Khách hàng vừa gửi yêu cầu hủy đơn O-001. Vui lòng xác nhận dừng trước khi bàn giao bưu tá (SC06).',
        isRead: false,
        createdAt: now,
      },
      {
        notificationId: 'NOTI-STAFF-002',
        eventId: 'EVT-APP-001',
        recipientId: 'staff-user',
        channel: 'IN_APP',
        category: 'APPROVAL_REQUESTED',
        title: 'Yêu cầu phê duyệt hoàn tiền ngoại lệ (P10)',
        message: 'Nhân viên CSKH vừa đề xuất hoàn tiền ngoại lệ 600.000đ cho đơn O-002.',
        isRead: false,
        createdAt: now,
      },
    ])
  }
  return state
}

export function listMockNotifications(recipientId: string): { items: NotificationItem[]; unreadCount: number } {
  const s = getMockNotificationState()
  const list = s.items.get(recipientId) || []
  const unreadCount = list.filter((i) => !i.isRead).length
  return { items: [...list], unreadCount }
}

export function markMockNotificationAsRead(recipientId: string, notificationId: string): boolean {
  const s = getMockNotificationState()
  const list = s.items.get(recipientId) || []
  const item = list.find((i) => i.notificationId === notificationId)
  if (item) {
    item.isRead = true
    return true
  }
  return false
}

export function markAllMockNotificationsAsRead(recipientId: string): number {
  const s = getMockNotificationState()
  const list = s.items.get(recipientId) || []
  let count = 0
  for (const item of list) {
    if (!item.isRead) {
      item.isRead = true
      count++
    }
  }
  return count
}

export function dispatchMockNotification(item: NotificationItem): void {
  const s = getMockNotificationState()
  const list = s.items.get(item.recipientId) || []
  list.unshift(item)
  s.items.set(item.recipientId, list)

  const subs = s.listeners.get(item.recipientId)
  if (subs) {
    for (const listener of subs) {
      listener(item)
    }
  }
}

export function subscribeMockNotifications(
  recipientId: string,
  listener: (item: NotificationItem) => void
): () => void {
  const s = getMockNotificationState()
  if (!s.listeners.has(recipientId)) {
    s.listeners.set(recipientId, new Set())
  }
  s.listeners.get(recipientId)!.add(listener)

  return () => {
    s.listeners.get(recipientId)?.delete(listener)
  }
}
