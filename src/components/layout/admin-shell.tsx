'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { cn } from '@/utils/tw-merge'
import { ADMIN_HOME, STOREFRONT_ROUTES } from '@/configs/navigation'
import { AdminSidebar } from './admin-sidebar'
import { Wordmark } from './wordmark'

const SIDEBAR_ID = 'admin-sidebar'

export function AdminShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-sticky-nav) flex h-14 items-center gap-3 border-b border-rule bg-paper px-4">
        <button
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls={SIDEBAR_ID}
          onClick={() => setIsMenuOpen((open) => !open)}
          className="btn btn-secondary px-3 shell:hidden"
        >
          {isMenuOpen ? (
            <X aria-hidden className="size-4" />
          ) : (
            <Menu aria-hidden className="size-4" />
          )}
          <span>Menu</span>
        </button>
        <Wordmark href={ADMIN_HOME} suffix="Backoffice" />
        <Link
          href={STOREFRONT_ROUTES.home}
          className="font-label ml-auto inline-flex min-h-11 items-center whitespace-nowrap text-sm text-ink-2 hover:text-ink"
        >
          View shop
        </Link>
      </header>
      <div className="flex flex-1 flex-col shell:grid shell:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
        <aside
          className={cn(
            'border-b border-rule bg-paper-2 shell:block shell:border-b-0 shell:border-r',
            isMenuOpen ? 'block' : 'hidden'
          )}
        >
          <AdminSidebar id={SIDEBAR_ID} onNavigate={() => setIsMenuOpen(false)} />
        </aside>
        <main id="main-content" className="min-w-0 px-4 py-8 shell:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}
