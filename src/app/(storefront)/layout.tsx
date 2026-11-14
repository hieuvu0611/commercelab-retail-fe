import { MAIN_CONTENT_ID, SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

export default function StorefrontLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} className="shell-container flex-1 pt-12">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
