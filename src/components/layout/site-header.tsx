import Link from 'next/link'
import { Search } from 'lucide-react'
import { fetchCategoryTreeOrNull } from '@/catalog/server-api'
import { CartButton } from '@/components/cart/cart-button'
import { SessionNotificationBell } from '@/components/notifications/session-notification-bell'
import { CategoryMenu } from '@/components/catalog/category-menu'
import { STOREFRONT_CATEGORIES, STOREFRONT_ROUTES } from '@/configs/navigation'
import { AccountMenu } from './account-menu'
import { SkipLink } from './skip-link'
import { Wordmark } from './wordmark'

function SearchForm() {
  return (
    <form
      role="search"
      action={STOREFRONT_ROUTES.search}
      method="get"
      className="flex w-full min-w-0 [grid-area:search]"
    >
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        id="site-search"
        type="search"
        name="q"
        placeholder="Search products"
        className="h-11 min-w-0 flex-1 rounded-control border border-r-0 border-rule-2 bg-paper px-4 text-ink placeholder:text-muted focus-visible:border-ink"
      />
      <button type="submit" className="btn btn-primary px-4">
        <Search aria-hidden className="size-4" />
        <span>Search</span>
      </button>
    </form>
  )
}

// Falls back to the static departments when the category tree cannot be loaded, so navigation never disappears.
async function CategoryNav() {
  const tree = await fetchCategoryTreeOrNull()
  if (tree) return <CategoryMenu tree={tree} />
  return (
    <nav aria-label="Categories" className="border-t border-rule">
      <ul className="shell-container flex gap-6 overflow-x-auto">
        {STOREFRONT_CATEGORIES.map((category) => (
          <li key={category.href} className="shrink-0">
            <Link
              href={category.href}
              className="font-label inline-flex h-11 items-center text-sm text-ink-2 no-underline transition-colors duration-150 hover:text-ink hover:underline"
            >
              {category.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export async function SiteHeader() {
  return (
    <header className="sticky top-0 z-(--z-sticky-nav) border-b border-rule bg-paper">
      <SkipLink />
      <div className="shell-container grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 py-3 [grid-template-areas:'brand_actions'_'search_search'] md:grid-cols-[auto_minmax(0,36rem)_1fr] md:[grid-template-areas:'brand_search_actions']">
        <div className="[grid-area:brand]">
          <Wordmark href={STOREFRONT_ROUTES.home} />
        </div>
        <SearchForm />
        <div className="flex items-center justify-end gap-1 [grid-area:actions]">
          <SessionNotificationBell />
          <CartButton />
          <AccountMenu />
        </div>
      </div>
      <CategoryNav />
    </header>
  )
}
