import type { Metadata } from 'next'
import { AdjustmentsAdmin } from '@/components/admin/adjustments-admin'

export const metadata: Metadata = {
  title: 'Inventory Adjustments Queue — CommerceLab Retail',
}

export default function AdminAdjustmentsPage() {
  return (
    <section className="max-w-[72rem]">
      <AdjustmentsAdmin />
    </section>
  )
}
