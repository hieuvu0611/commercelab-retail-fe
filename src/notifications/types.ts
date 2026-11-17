export interface NotificationItem {
  notificationId: string
  eventId: string
  recipientId: string
  channel: string
  category: string
  title: string
  message: string
  isRead: boolean
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unreadCount: number
}
