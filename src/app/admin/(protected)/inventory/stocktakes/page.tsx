import type { Metadata } from 'next'
import { StocktakesAdmin } from '@/components/admin/stocktakes-admin'

export const metadata: Metadata = {
  title: 'Warehouse Stocktakes — CommerceLab Retail',
}

export default function AdminStocktakesPage() {
  return (
    <section className="max-w-[72rem]">
      <StocktakesAdmin />
    </section>
  )
}
