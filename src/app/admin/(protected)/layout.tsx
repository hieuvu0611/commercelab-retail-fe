import type { Metadata } from 'next'
import { AdminShell } from '@/components/layout/admin-shell'

export const metadata: Metadata = {
  title: 'Backoffice — CommerceLab Retail',
}

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>
}
