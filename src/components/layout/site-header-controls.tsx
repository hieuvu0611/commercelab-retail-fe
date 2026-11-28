'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { STOREFRONT_CATEGORIES, STOREFRONT_ROUTES } from '@/configs/navigation'
import { useI18n } from '@/i18n'

export function HeaderSearchForm() {
  const { t } = useI18n()

  return (
    <form
      role="search"
      action={STOREFRONT_ROUTES.search}
      method="get"
      className="flex w-full min-w-0 [grid-area:search]"
    >
      <label htmlFor="site-search" className="sr-only">
        {t('header.searchLabel')}
      </label>
      <input
        id="site-search"
        type="search"
        name="q"
        placeholder={t('header.searchPlaceholder')}
        className="h-11 min-w-0 flex-1 rounded-control border border-r-0 border-rule-2 bg-paper px-4 text-ink placeholder:text-muted focus-visible:border-ink"
      />
      <button type="submit" className="btn btn-primary px-4">
        <Search aria-hidden className="size-4" />
        <span>{t('header.searchButton')}</span>
      </button>
    </form>
  )
}

export function FallbackCategoryNav() {
  const { t } = useI18n()

  return (
    <nav aria-label={t('header.categoriesNav')} className="border-t border-rule">
      <ul className="shell-container flex gap-6 overflow-x-auto">
        {STOREFRONT_CATEGORIES.map((category) => (
          <li key={category.href} className="shrink-0">
            <Link
              href={category.href}
              className="font-label inline-flex h-11 items-center text-sm text-ink-2 no-underline transition-colors duration-150 hover:text-ink hover:underline"
            >
              {category.labelKey ? t(category.labelKey) : category.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
