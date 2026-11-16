import type { Metadata } from 'next'
import { ReturnsAdmin } from '@/components/admin/returns-admin'

export const metadata: Metadata = {
  title: 'Returns & RMA — CommerceLab Retail Admin',
}

export default function AdminReturnsPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl font-bold text-ink">Returns & RMA Management</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Manage customer return requests, warehouse receipts, QC inspections, refund approvals, and linked exchange orders.
      </p>
      <ReturnsAdmin />
    </section>
  )
}
