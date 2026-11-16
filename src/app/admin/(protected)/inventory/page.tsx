import type { Metadata } from 'next'
import { InventoryAdmin } from '@/components/admin/inventory-admin'
import { InventoryNav } from '@/components/admin/inventory-nav'

export const metadata: Metadata = {
  title: 'Inventory — CommerceLab Retail',
}

export default function AdminInventoryPage() {
  return (
    <section className="max-w-[64rem]">
      <div className="mb-4">
        <h1 className="text-3xl">Inventory</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">
          Stock of every SKU in your warehouses. Available is what customers can buy: on hand minus
          unsellable, reserved and committed. Every change is recorded with your name and the reason.
        </p>
      </div>
      <InventoryNav />
      <InventoryAdmin />
    </section>
  )
}
