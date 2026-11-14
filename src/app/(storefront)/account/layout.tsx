import type { Metadata } from 'next'
import { AccountNav } from '@/components/account/account-nav'

export const metadata: Metadata = {
  title: 'Your account — CommerceLab Retail',
}

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <section className="border-t-4 border-ink pt-6">
      <h1 className="text-3xl">Your account</h1>
      <AccountNav />
      {children}
    </section>
  )
}
