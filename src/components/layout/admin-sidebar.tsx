'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/tw-merge'
import { ADMIN_NAV, isCurrentPath } from '@/configs/navigation'
import { useI18n } from '@/i18n'

interface AdminSidebarProps {
  id?: string
  onNavigate?: () => void
}

export function AdminSidebar({ id, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav id={id} aria-label={t('admin.shell.backoffice')} className="flex flex-col gap-6 px-3 py-6">
      {ADMIN_NAV.map((group) => (
        <div key={group.label}>
          <p className="font-label px-3 pb-1 text-xs text-muted">
            {group.labelKey ? t(group.labelKey) : group.label}
          </p>
          <ul>
            {group.links.map((link) => {
              const isCurrent = isCurrentPath(pathname, link.href)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'font-label flex h-9 items-center border-l-2 px-3 text-sm no-underline transition-colors duration-150',
                      isCurrent
                        ? 'border-accent bg-paper text-ink'
                        : 'border-transparent text-ink-2 hover:bg-paper-3 hover:text-ink'
                    )}
                  >
                    {link.labelKey ? t(link.labelKey) : link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
