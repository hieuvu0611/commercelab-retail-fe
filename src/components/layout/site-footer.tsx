'use client'

import Link from 'next/link'
import { STOREFRONT_CATEGORIES, STOREFRONT_ROUTES, type NavLink } from '@/configs/navigation'
import { useI18n } from '@/i18n'
import { FooterAccountLinks } from './footer-account-links'
import { Wordmark } from './wordmark'

function FooterLinks({ title, links }: { title: string; links: NavLink[] }) {
  const { t } = useI18n()

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
              {link.labelKey ? t(link.labelKey) : link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function SiteFooter() {
  const { t } = useI18n()

  return (
    <footer className="mt-24 border-t-4 border-ink">
      <div className="shell-container grid gap-10 py-12 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark href={STOREFRONT_ROUTES.home} />
          <p className="max-w-[40ch] text-ink-2">{t('footer.tagline')}</p>
        </div>
        <FooterLinks title={t('footer.shop')} links={STOREFRONT_CATEGORIES} />
        <FooterAccountLinks />
      </div>
      <div className="border-t border-rule">
        <p className="shell-container font-label py-4 text-xs text-muted">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  )
}
