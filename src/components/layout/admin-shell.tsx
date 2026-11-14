'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { cn } from '@/utils/tw-merge'
import { ADMIN_HOME, STOREFRONT_ROUTES } from '@/configs/navigation'
import { AdminSidebar } from './admin-sidebar'
import { MAIN_CONTENT_ID, SkipLink } from './skip-link'
import { Wordmark } from './wordmark'

const SIDEBAR_ID = 'admin-sidebar'
const ADMIN_LOGIN = STOREFRONT_ROUTES.staffLogin

export function AdminShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { data: session } = useSession()

  useEffect(() => {
    if (!isMenuOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen])

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="sticky top-0 z-(--z-sticky-nav) flex h-14 items-center gap-3 border-b border-rule bg-paper px-4">
        <button
          ref={menuButtonRef}
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
        {session?.user && (
          <>
            <span className="hidden max-w-[14rem] truncate text-sm text-muted shell:inline">
              {session.user.name}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: ADMIN_LOGIN })}
              className="font-label inline-flex min-h-11 items-center whitespace-nowrap text-sm text-ink-2 hover:text-ink"
            >
              Sign out
            </button>
          </>
        )}
      </header>
      <div className="flex flex-1 flex-col shell:grid shell:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
        <div
          className={cn(
            'border-b border-rule bg-paper-2 shell:block shell:border-b-0 shell:border-r',
            isMenuOpen ? 'block' : 'hidden'
          )}
        >
          <AdminSidebar id={SIDEBAR_ID} onNavigate={() => setIsMenuOpen(false)} />
        </div>
        <main id={MAIN_CONTENT_ID} className="min-w-0 px-4 py-8 shell:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}
