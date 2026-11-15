import type { Metadata } from 'next'
import { OrderDetailView } from '@/components/orders/order-detail-view'

export const metadata: Metadata = {
  title: 'Order — CommerceLab Retail',
}

export default async function OrderPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ placed?: string }>
}>) {
  const [{ orderId }, { placed }] = await Promise.all([params, searchParams])
  return <OrderDetailView orderId={orderId} isNew={placed === '1'} />
}
