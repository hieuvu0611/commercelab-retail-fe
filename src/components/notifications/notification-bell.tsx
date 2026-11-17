'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '@/notifications/use-notifications'
import { cn } from '@/utils/tw-merge'

export function NotificationBell({ recipientId }: { recipientId?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { items, unreadCount, markAsRead, markAllAsRead } = useNotifications(recipientId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative inline-flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-paper-2 hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
      >
        <Bell aria-hidden className="size-5" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow-xs"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification inbox"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-card border border-rule bg-paper p-4 shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <h3 className="font-label text-base font-semibold text-ink">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink hover:underline"
              >
                <CheckCheck className="size-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="mt-3 max-h-80 divide-y divide-rule overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-6 text-center text-sm text-ink-2">No notifications</div>
            ) : (
              items.map((item) => (
                <div
                  key={item.notificationId}
                  onClick={() => {
                    if (!item.isRead) markAsRead(item.notificationId)
                  }}
                  className={cn(
                    'cursor-pointer py-3 text-left transition-colors hover:bg-paper-2',
                    !item.isRead ? 'font-medium' : 'opacity-80'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-block rounded-xs px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        item.category.includes('STOP') || item.category.includes('EXCEPTION')
                          ? 'bg-warn-soft text-warn'
                          : 'bg-paper-2 text-ink-2'
                      )}
                    >
                      {item.category.replace(/_/g, ' ')}
                    </span>
                    {!item.isRead && (
                      <span className="size-2 shrink-0 rounded-full bg-accent" />
                    )}
                  </div>
                  <h4 className="mt-1 text-sm text-ink">{item.title}</h4>
                  <p className="mt-0.5 text-xs text-ink-2">{item.message}</p>
                  <time className="mt-1 block text-[10px] text-muted">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
