import type { Metadata } from 'next'
import { InventoryNav } from '@/components/admin/inventory-nav'
import { TransfersAdmin } from '@/components/admin/transfers-admin'

export const metadata: Metadata = {
  title: 'Inter-Warehouse Transfers | Inventory Operations',
}

export default function InventoryTransfersPage() {
  return (
    <section className="max-w-[70rem]">
      <h1 className="text-3xl mb-4">Inventory Operations</h1>
      <InventoryNav />
      <TransfersAdmin />
    </section>
  )
}
