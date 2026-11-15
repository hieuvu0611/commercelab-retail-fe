import type { Metadata } from 'next'
import { OrderHistory } from '@/components/orders/order-history'

export const metadata: Metadata = {
  title: 'Your orders — CommerceLab Retail',
}

export default function OrdersPage() {
  return (
    <section>
      <h2 className="mt-6 text-2xl">Your orders</h2>
      <OrderHistory />
    </section>
  )
}
