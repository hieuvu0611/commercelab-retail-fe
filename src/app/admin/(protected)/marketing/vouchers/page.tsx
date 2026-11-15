import type { Metadata } from 'next'
import { VouchersAdmin } from '@/components/admin/vouchers-admin'

export const metadata: Metadata = {
  title: 'Voucher campaigns — CommerceLab Retail',
}

export default function AdminVouchersPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Voucher campaigns</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Create a campaign, set its quota and dates, and deactivate it when it should stop. One
        voucher applies per order and never to shipping.
      </p>
      <VouchersAdmin />
    </section>
  )
}
