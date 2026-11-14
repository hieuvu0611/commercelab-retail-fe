import { categoryHref } from '@/catalog/category-tree'
import { fetchCategoryTreeOrNull, optOutOfCachingInMockMode, serverGet } from '@/catalog/server-api'
import { FeaturedCategories, Hero, NewProductsRail } from '@/components/catalog/home-sections'
import type { ProductListItem } from '@/types/catalog'

const NEW_PRODUCTS_COUNT = 8

async function fetchNewProducts(): Promise<ProductListItem[]> {
  optOutOfCachingInMockMode()
  return serverGet<ProductListItem[]>('/products', {
    sort: 'newest',
    limit: String(NEW_PRODUCTS_COUNT),
  }).catch(() => [])
}

export default async function Home() {
  const [tree, products] = await Promise.all([fetchCategoryTreeOrNull(), fetchNewProducts()])
  const categories = tree ?? []
  return (
    <>
      <Hero shopHref={categories[0] ? categoryHref(categories[0].path) : '/search'} />
      <FeaturedCategories categories={categories} />
      <NewProductsRail products={products} />
    </>
  )
}
