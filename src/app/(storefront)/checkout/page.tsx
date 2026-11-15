import type { Metadata } from 'next'
import { CheckoutView } from '@/components/checkout/checkout-view'

export const metadata: Metadata = {
  title: 'Checkout — CommerceLab Retail',
}

export default function CheckoutPage() {
  return (
    <section className="border-t-4 border-ink pt-6">
      <h1 className="text-3xl">Checkout</h1>
      <CheckoutView />
    </section>
  )
}
