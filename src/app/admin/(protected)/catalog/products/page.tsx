import type { Metadata } from 'next'
import { ProductsAdmin } from '@/components/admin/products-admin'

export const metadata: Metadata = {
  title: 'Products — CommerceLab Retail',
}

export default function AdminProductsPage() {
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Products</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Create products, add variants, images and categories, and publish them to the shop.
      </p>
      <ProductsAdmin />
    </section>
  )
}
