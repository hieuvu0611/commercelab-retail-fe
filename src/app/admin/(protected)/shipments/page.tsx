import type { Metadata } from 'next'
import { ShipmentsAdmin } from '@/components/admin/shipments-admin'

export const metadata: Metadata = {
  title: 'Shipments — CommerceLab Retail',
}

export default function AdminShipmentsPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Shipments</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Confirmed orders waiting to be picked, packed and handed to the carrier. You only see the
        warehouses you work in.
      </p>
      <ShipmentsAdmin />
    </section>
  )
}
