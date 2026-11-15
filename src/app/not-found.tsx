import Link from 'next/link'
import { CartProvider } from '@/cart/cart-context'
import { MiniCartDrawer } from '@/components/cart/mini-cart-drawer'
import { SiteHeader } from '@/components/layout/site-header'
import { MAIN_CONTENT_ID } from '@/components/layout/skip-link'
import { SiteFooter } from '@/components/layout/site-footer'
import { StatusMessage } from '@/components/layout/status-message'
import { STOREFRONT_ROUTES } from '@/configs/navigation'

export default function NotFound() {
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id={MAIN_CONTENT_ID} className="shell-container flex-1 pt-12">
          <StatusMessage
            title="Page not found"
            description="The address may be mistyped, or the page has moved."
            actions={
              <Link href={STOREFRONT_ROUTES.home} className="btn btn-primary">
                Back to the shop
              </Link>
            }
          />
        </main>
        <SiteFooter />
        <MiniCartDrawer />
      </div>
    </CartProvider>
  )
}
