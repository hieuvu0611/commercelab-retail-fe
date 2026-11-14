import type { Metadata } from 'next'
import { CategoriesAdmin } from '@/components/admin/categories-admin'

export const metadata: Metadata = {
  title: 'Categories — CommerceLab Retail',
}

export default function AdminCategoriesPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Categories</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Organise the shop menu: up to three levels. Deactivating a category hides it from customers;
        a category can only be deleted when it has no subcategories or products.
      </p>
      <CategoriesAdmin />
    </section>
  )
}
