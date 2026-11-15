import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { toProductDetail } from '@/catalog/adapters'
import { categoryBreadcrumb, categoryChain, categoryPathById } from '@/catalog/category-tree'
import {
  optOutOfCachingInMockMode,
  ServerApiError,
  fetchCategoryTree,
  serverGet,
} from '@/catalog/server-api'
import { CatalogBreadcrumb } from '@/components/catalog/catalog-breadcrumb'
import { ProductDetailView } from '@/components/catalog/product-detail-view'
import type { ProductDetail } from '@/types/catalog'

interface PageProps {
  params: Promise<{ slug: string }>
}

const DESCRIPTION_MAX = 160

async function loadProduct(slug: string): Promise<ProductDetail | null> {
  optOutOfCachingInMockMode()
  try {
    return toProductDetail(await serverGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`))
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return null
    throw error
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await loadProduct((await params).slug)
  if (!product) return { title: 'Product not found — CommerceLab Retail' }
  const image = product.images[0]?.url
  return {
    title: `${product.name} — CommerceLab Retail`,
    description: product.description.slice(0, DESCRIPTION_MAX),
    openGraph: {
      title: product.name,
      description: product.description.slice(0, DESCRIPTION_MAX),
      ...(image && !image.startsWith('data:') && { images: [image] }),
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const product = await loadProduct((await params).slug)
  if (!product) notFound()

  const tree = await fetchCategoryTree().catch(() => [])
  const categoryPath =
    product.categoryPath ?? categoryPathById(tree, product.primaryCategoryId ?? null)
  const chain = categoryPath ? categoryChain(tree, categoryPath) : undefined
  const entries = chain
    ? categoryBreadcrumb(chain, product.name)
    : [{ label: 'Home', href: '/' }, { label: product.name }]

  return (
    <section>
      <CatalogBreadcrumb entries={entries} />
      <div className="mt-6">
        <ProductDetailView product={product} />
      </div>
    </section>
  )
}
