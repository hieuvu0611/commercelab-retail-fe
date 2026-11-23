import { fetchCategoryTreeOrNull } from '@/catalog/server-api'
import { CartButton } from '@/components/cart/cart-button'
import { SessionNotificationBell } from '@/components/notifications/session-notification-bell'
import { CategoryMenu } from '@/components/catalog/category-menu'
import { STOREFRONT_ROUTES } from '@/configs/navigation'
import { AccountMenu } from './account-menu'
import { LocaleSwitcher } from './locale-switcher'
import { FallbackCategoryNav, HeaderSearchForm } from './site-header-controls'
import { SkipLink } from './skip-link'
import { Wordmark } from './wordmark'

// Falls back to the static departments when the category tree cannot be loaded, so navigation never disappears.
async function CategoryNav() {
  const tree = await fetchCategoryTreeOrNull()
  if (tree) return <CategoryMenu tree={tree} />
  return <FallbackCategoryNav />
}

export async function SiteHeader() {
  return (
    <header className="sticky top-0 z-(--z-sticky-nav) border-b border-rule bg-paper">
      <SkipLink />
      <div className="shell-container grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 py-3 [grid-template-areas:'brand_actions'_'search_search'] md:grid-cols-[auto_minmax(0,36rem)_1fr] md:[grid-template-areas:'brand_search_actions']">
        <div className="[grid-area:brand]">
          <Wordmark href={STOREFRONT_ROUTES.home} />
        </div>
        <HeaderSearchForm />
        <div className="flex items-center justify-end gap-1 [grid-area:actions]">
          <LocaleSwitcher className="mr-1" />
          <SessionNotificationBell />
          <CartButton />
          <AccountMenu />
        </div>
      </div>
      <CategoryNav />
    </header>
  )
}
