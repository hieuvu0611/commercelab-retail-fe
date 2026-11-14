import type { Metadata } from 'next'
import { ProductEditor } from '@/components/admin/product-editor'

export const metadata: Metadata = {
  title: 'Edit product — CommerceLab Retail',
}

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <section className="max-w-[64rem]">
      <ProductEditor productId={id} />
    </section>
  )
}
