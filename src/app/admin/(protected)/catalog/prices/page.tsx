import type { Metadata } from 'next'
import { PricesAdmin } from '@/components/admin/prices-admin'

export const metadata: Metadata = {
  title: 'Prices — CommerceLab Retail',
}

export default function AdminPricesPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Prices</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Set a new price for a SKU with the date it starts to apply. Earlier prices stay in the
        history.
      </p>
      <PricesAdmin />
    </section>
  )
}
