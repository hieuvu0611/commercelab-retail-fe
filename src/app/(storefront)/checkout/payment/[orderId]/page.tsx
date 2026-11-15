import type { Metadata } from 'next'
import { PaymentView } from '@/components/orders/payment-view'

export const metadata: Metadata = {
  title: 'Payment — CommerceLab Retail',
}

export default async function PaymentPage({
  params,
}: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const { orderId } = await params
  return (
    <section className="border-t-4 border-ink pt-6">
      <h1 className="text-3xl">Payment</h1>
      <PaymentView orderId={orderId} />
    </section>
  )
}
