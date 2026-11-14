'use client'

import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { STOREFRONT_ROUTES } from '@/configs/navigation'

const MENU_LINKS = [
  { label: 'Sign in', href: STOREFRONT_ROUTES.login },
  { label: 'Create account', href: STOREFRONT_ROUTES.register },
]

export function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const hadFocus = containerRef.current?.contains(document.activeElement)
      setIsOpen(false)
      if (hadFocus) triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Close when focus moves to another element outside the menu. A null
  // relatedTarget (Safari does not focus links on click) is left to the
  // pointerdown handler so a click on a menu link still lands.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next && !event.currentTarget.contains(next)) {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} onBlur={handleBlur} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className="font-label inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm text-ink transition-colors duration-150 hover:bg-paper-2 active:bg-paper-3"
      >
        <UserRound aria-hidden className="size-5" />
        <span>Account</span>
      </button>
      {isOpen && (
        <ul
          id={menuId}
          className="absolute right-0 top-full z-(--z-dropdown) mt-1 w-48 border border-rule-2 bg-paper py-1"
        >
          {MENU_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="font-label block px-4 py-2.5 text-sm text-ink no-underline transition-colors duration-150 hover:bg-paper-2"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
