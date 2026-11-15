import type { Metadata } from 'next'
import { OrdersAdmin } from '@/components/admin/orders-admin'

export const metadata: Metadata = {
  title: 'Orders — CommerceLab Retail',
}

export default function AdminOrdersPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Orders</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Every customer order with its payment state. Customer names are shortened and street
        addresses are not shown.
      </p>
      <OrdersAdmin />
    </section>
  )
}
