import type { Metadata } from 'next'
import { UsersAdmin } from '@/components/admin/users-admin'

export const metadata: Metadata = {
  title: 'Staff users — CommerceLab Retail',
}

export default function AdminUsersPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Staff users</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Create staff accounts, choose their roles and warehouses, and deactivate accounts. Every
        change is recorded with your name and the reason you give.
      </p>
      <UsersAdmin />
    </section>
  )
}
