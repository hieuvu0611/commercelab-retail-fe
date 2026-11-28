'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n, type MessageKey } from '@/i18n'
import { cn } from '@/utils/tw-merge'

const TABS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'account.tab.profile', href: '/account' },
  { labelKey: 'account.tab.orders', href: '/account/orders' },
  { labelKey: 'account.tab.addresses', href: '/account/addresses' },
  { labelKey: 'account.tab.security', href: '/account/security' },
]

export function AccountNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <nav aria-label={t('account.sectionsLabel')} className="mt-4 flex gap-6 border-b border-rule">
      {TABS.map((tab) => {
        const isCurrent = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'font-label -mb-px inline-flex min-h-11 items-center border-b-2 text-sm no-underline',
              isCurrent ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            )}
          >
            {t(tab.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
