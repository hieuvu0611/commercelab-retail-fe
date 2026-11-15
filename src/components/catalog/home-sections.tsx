import Link from 'next/link'
import { categoryHref } from '@/catalog/category-tree'
import type { CategoryNode, ProductListItem } from '@/types/catalog'
import { ProductCard } from './product-card'

export function Hero({ shopHref }: { shopHref: string }) {
  return (
    <section className="border-t-4 border-ink pt-6">
      <h1 className="text-display max-w-[18ch]">Backpacks, bottles and travel gear</h1>
      <p className="mt-4 max-w-[52ch] text-lg text-ink">
        Everyday carry that lasts, sold and shipped by us. Pick a category or search for exactly
        what you need.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={shopHref} className="btn btn-primary">
          Shop now
        </Link>
        <Link href="/search?q=bottle" className="btn btn-secondary">
          Find a bottle
        </Link>
      </div>
    </section>
  )
}

export function FeaturedCategories({ categories }: { categories: CategoryNode[] }) {
  if (categories.length === 0) return null
  return (
    <section aria-labelledby="featured-categories" className="mt-16">
      <h2 id="featured-categories" className="text-2xl">
        Shop by category
      </h2>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id} className="border-t border-rule-2">
            <Link href={categoryHref(category.path)} className="group block py-4 no-underline">
              <span className="font-label text-xl text-ink group-hover:underline">
                {category.name}
              </span>
              {category.children.length > 0 && (
                <span className="mt-1 block text-sm text-muted">
                  {category.children.map((child) => child.name).join(' · ')}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NewProductsRail({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) return null
  return (
    <section aria-labelledby="new-products" className="mt-16">
      <h2 id="new-products" className="text-2xl">
        New arrivals
      </h2>
      <ul className="relative mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            className="w-44 shrink-0 snap-start md:w-56"
          />
        ))}
      </ul>
    </section>
  )
}
