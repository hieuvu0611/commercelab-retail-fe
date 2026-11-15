import type { Metadata } from 'next'
import { OrderAdminDetail } from '@/components/admin/orders-admin'

export const metadata: Metadata = {
  title: 'Order — CommerceLab Retail',
}

export default async function AdminOrderPage({
  params,
}: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const { orderId } = await params
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Order</h1>
      <OrderAdminDetail orderId={orderId} />
    </section>
  )
}
