'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/tw-merge'

const TABS = [
  { label: 'Profile', href: '/account' },
  { label: 'Addresses', href: '/account/addresses' },
  { label: 'Security', href: '/account/security' },
]

export function AccountNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Account sections" className="mt-4 flex gap-6 border-b border-rule">
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
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
