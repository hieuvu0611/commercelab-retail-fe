import Link from 'next/link'
import { STOREFRONT_CATEGORIES, STOREFRONT_ROUTES, type NavLink } from '@/configs/navigation'
import { Wordmark } from './wordmark'

const ACCOUNT_LINKS: NavLink[] = [
  { label: 'Sign in', href: STOREFRONT_ROUTES.login },
  { label: 'Create account', href: STOREFRONT_ROUTES.register },
  { label: 'Staff sign-in', href: STOREFRONT_ROUTES.staffLogin },
]

function FooterLinks({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-lg">{title}</h2>
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

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-4 border-ink">
      <div className="shell-container grid gap-10 py-12 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark href={STOREFRONT_ROUTES.home} />
          <p className="max-w-[40ch] text-ink-2">
            Backpacks, water bottles and travel accessories, sold and shipped by us.
          </p>
        </div>
        <FooterLinks title="Shop" links={STOREFRONT_CATEGORIES} />
        <FooterLinks title="Account" links={ACCOUNT_LINKS} />
      </div>
      <div className="border-t border-rule">
        <p className="shell-container font-label py-4 text-xs text-muted">
          © {new Date().getFullYear()} CommerceLab Retail
        </p>
      </div>
    </footer>
  )
}
