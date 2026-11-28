'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { STOREFRONT_ROUTES, type NavLink } from '@/configs/navigation'
import { useI18n } from '@/i18n'

const SIGNED_OUT_LINKS: NavLink[] = [
  { label: 'Sign in', labelKey: 'header.signIn', href: STOREFRONT_ROUTES.login },
  { label: 'Create account', labelKey: 'header.createAccount', href: STOREFRONT_ROUTES.register },
  { label: 'Staff sign-in', labelKey: 'footer.staffSignIn', href: STOREFRONT_ROUTES.staffLogin },
]

const SIGNED_IN_LINKS: NavLink[] = [
  { label: 'Your account', labelKey: 'header.yourAccount', href: STOREFRONT_ROUTES.account },
]

// The footer's account column follows the session: signed-in people are not offered "Sign in".
export function FooterAccountLinks() {
  const { data: session, status } = useSession()
  const { t } = useI18n()
  const isSignedIn = status === 'authenticated' && !session?.error && Boolean(session?.user)
  const links = isSignedIn ? SIGNED_IN_LINKS : SIGNED_OUT_LINKS

  return (
    <nav aria-label={t('footer.account')}>
      <h2 className="text-lg">{t('footer.account')}</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="font-label inline-flex min-h-11 items-center text-sm text-ink-2 hover:text-ink"
            >
              {link.labelKey ? t(link.labelKey) : link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
