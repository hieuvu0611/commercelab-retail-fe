import type { Metadata } from 'next'
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link'
import { Wordmark } from '@/components/layout/wordmark'
import { ADMIN_HOME } from '@/configs/navigation'

export const metadata: Metadata = {
  title: 'Staff sign-in — CommerceLab Retail',
}

// The staff sign-in page sits outside the guarded backoffice shell: it must be reachable while signed out.
export default function AdminLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="flex h-14 items-center border-b border-rule px-4">
        <Wordmark href={ADMIN_HOME} suffix="Backoffice" />
      </header>
      <main id={MAIN_CONTENT_ID} className="px-4 py-10 shell:px-10">
        {children}
      </main>
    </div>
  )
}
