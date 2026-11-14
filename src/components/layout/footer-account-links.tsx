'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { STOREFRONT_ROUTES, type NavLink } from '@/configs/navigation'

const SIGNED_OUT_LINKS: NavLink[] = [
  { label: 'Sign in', href: STOREFRONT_ROUTES.login },
  { label: 'Create account', href: STOREFRONT_ROUTES.register },
  { label: 'Staff sign-in', href: STOREFRONT_ROUTES.staffLogin },
]

const SIGNED_IN_LINKS: NavLink[] = [{ label: 'Your account', href: STOREFRONT_ROUTES.account }]

// The footer's account column follows the session: signed-in people are not offered "Sign in".
export function FooterAccountLinks() {
  const { data: session, status } = useSession()
  const isSignedIn = status === 'authenticated' && !session?.error && Boolean(session?.user)
  const links = isSignedIn ? SIGNED_IN_LINKS : SIGNED_OUT_LINKS

  return (
    <nav aria-label="Account">
      <h2 className="text-lg">Account</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="font-label inline-flex min-h-11 items-center text-sm text-ink-2 hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
