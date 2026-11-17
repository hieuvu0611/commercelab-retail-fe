'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { fetchProductPage } from '@/catalog/catalog-api'
import { listStateToSearch, parseListState, PRODUCTS_PER_PAGE } from '@/catalog/list-query'
import { PRODUCT_SORTS, type ProductListParams, type ProductSort } from '@/types/catalog'
import { ProductCard } from './product-card'
import { ProductFilters } from './product-filters'

const FACET_QUERY_LIMIT = 100
const SKELETON_COUNT = 8
const SORT_LABELS: Record<ProductSort, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
}

interface ProductListingProps {
  /** Category path to list (descendants included). */
  category?: string
  /** Search text; kept in the URL by the search page, not by this component. */
  q?: string
}

function Skeletons() {
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <li key={index} className="flex animate-pulse flex-col gap-3">
          <div className="aspect-square bg-paper-3" />
          <div className="h-4 w-3/4 bg-paper-3" />
          <div className="h-4 w-1/2 bg-paper-3" />
        </li>
      ))}
    </ul>
  )
}

export function ProductListing({ category, q }: ProductListingProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const state = parseListState(searchParams)
  const scope: ProductListParams = { ...(category && { category }), ...(q && { q }) }

  const products = useQuery({
    queryKey: ['products', scope, state],
    queryFn: () => fetchProductPage({ ...scope, ...state, limit: PRODUCTS_PER_PAGE }),
    placeholderData: (previous) => previous,
  })

  // Facet options come from the result set without attribute filters or paging, so ticking one colour
  // does not hide the others.
  const facetSource = useQuery({
    queryKey: ['product-facets', scope, state.minPrice, state.maxPrice],
    queryFn: () =>
      fetchProductPage({
        ...scope,
        ...(state.minPrice && { minPrice: state.minPrice }),
        ...(state.maxPrice && { maxPrice: state.maxPrice }),
        limit: FACET_QUERY_LIMIT,
      }),
    placeholderData: (previous) => previous,
  })
  const facets: Record<string, string[]> = {}
  for (const item of facetSource.data?.items ?? []) {
    for (const [axis, values] of Object.entries(item.attributes)) {
      facets[axis] = [...new Set([...(facets[axis] ?? []), ...values])].sort()
    }
  }
  for (const [axis, values] of Object.entries(state.attrs ?? {})) {
    facets[axis] = [...new Set([...(facets[axis] ?? []), ...values])].sort()
  }

  const hrefFor = (next: ProductListParams) => {
    const search = listStateToSearch(next, q).toString()
    return search ? `${pathname}?${search}` : pathname
  }
  // The search page keeps q in its own URL; categories do not have one.
  const apply = (next: ProductListParams) => router.replace(hrefFor(next), { scroll: false })
  const clear = () => router.replace(hrefFor({}), { scroll: false })
  const hasFilters = Boolean(
    state.minPrice || state.maxPrice || Object.values(state.attrs ?? {}).some((v) => v.length)
  )

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside aria-label="Filters">
        <button
          type="button"
          aria-expanded={showFilters}
          aria-controls="product-filters"
          onClick={() => setShowFilters((open) => !open)}
          className="btn btn-secondary w-full md:hidden"
        >
          {showFilters ? 'Hide filters' : 'Show filters'}
        </button>
        <div id="product-filters" className={`${showFilters ? 'mt-4 block' : 'hidden'} md:block`}>
          <ProductFilters state={state} facets={facets} onChange={apply} onClear={clear} />
        </div>
      </aside>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p role="status" className="text-sm text-ink-2">
            {products.data
              ? `${products.data.total} product${products.data.total === 1 ? '' : 's'}`
              : 'Loading…'}
            {products.data?.searchEngine === 'opensearch' && (
              <span className="ml-2 rounded bg-paper-2 px-2 py-0.5 text-xs text-ink">
                OpenSearch · live stock &amp; price
              </span>
            )}
          </p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <span className="font-label">Sort by</span>
            <select
              value={state.sort}
              onChange={(event) =>
                apply({ ...state, sort: event.target.value as ProductSort, page: 1 })
              }
              className="h-11 border border-rule-2 bg-paper px-3 text-ink focus-visible:border-ink"
            >
              {PRODUCT_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {products.data?.facets?.brands && products.data.facets.brands.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <span className="font-label text-ink">Top brands (OpenSearch):</span>
            {products.data.facets.brands.map((b) => (
              <Link
                key={b.key}
                href={`${pathname}?q=${encodeURIComponent(b.key)}`}
                className="rounded border border-rule-2 bg-paper-2 px-2 py-0.5 hover:bg-paper-3"
              >
                {b.key} ({b.count})
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6">
          {products.isError ? (
            <div role="alert" className="border-l-4 border-error bg-paper-2 px-4 py-3">
              <p className="text-ink">We could not load the products.</p>
              <button
                type="button"
                onClick={() => void products.refetch()}
                className="font-label mt-2 min-h-11 text-ink underline"
              >
                Try again
              </button>
            </div>
          ) : !products.data ? (
            <Skeletons />
          ) : products.data.items.length === 0 ? (
            <div className="border-t border-rule-2 bg-paper-2 px-6 py-8">
              <p className="font-label text-lg text-ink">
                {q ? `No products found for “${q}”` : 'No products match these filters'}
              </p>
              <p className="mt-2 text-ink-2">
                {hasFilters
                  ? 'Try removing a filter.'
                  : 'Try a different search or browse the categories.'}
              </p>
              {hasFilters && (
                <button type="button" onClick={clear} className="btn btn-secondary mt-4">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
              {products.data.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ul>
          )}
        </div>

        {products.data && products.data.pageCount > 1 && (
          <nav aria-label="Pages" className="mt-10 flex items-center gap-4 text-sm">
            {(state.page ?? 1) > 1 && (
              <Link
                href={hrefFor({ ...state, page: (state.page ?? 1) - 1 })}
                className="btn btn-secondary"
              >
                Previous
              </Link>
            )}
            <span>
              Page {state.page} of {products.data.pageCount}
            </span>
            {(state.page ?? 1) < products.data.pageCount && (
              <Link
                href={hrefFor({ ...state, page: (state.page ?? 1) + 1 })}
                className="btn btn-secondary"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
