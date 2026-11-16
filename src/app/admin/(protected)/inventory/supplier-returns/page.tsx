import type { Metadata } from 'next'
import { SupplierReturnsAdmin } from '@/components/admin/supplier-returns-admin'

export const metadata: Metadata = {
  title: 'Supplier Returns (RTV) — CommerceLab Retail',
}

export default function AdminSupplierReturnsPage() {
  return (
    <section className="max-w-[72rem]">
      <SupplierReturnsAdmin />
    </section>
  )
}
