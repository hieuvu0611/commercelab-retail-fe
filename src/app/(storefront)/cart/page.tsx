import type { Metadata } from 'next'
import { CartView } from '@/components/cart/cart-view'

export const metadata: Metadata = {
  title: 'Your cart — CommerceLab Retail',
}

export default function CartPage() {
  return (
    <section className="border-t-4 border-ink pt-6">
      <h1 className="text-3xl">Your cart</h1>
      <CartView />
    </section>
  )
}
