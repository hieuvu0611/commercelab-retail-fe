import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProductListing } from '@/components/catalog/product-listing'

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[] }>
}

const MAX_QUERY_LENGTH = 100

async function readQuery({ searchParams }: SearchPageProps): Promise<string> {
  const { q } = await searchParams
  return (Array.isArray(q) ? q[0] : (q ?? '')).trim().slice(0, MAX_QUERY_LENGTH)
}

export async function generateMetadata(props: SearchPageProps): Promise<Metadata> {
  const q = await readQuery(props)
  return { title: q ? `Search: ${q} — CommerceLab Retail` : 'Search — CommerceLab Retail' }
}

export default async function SearchPage(props: SearchPageProps) {
  const q = await readQuery(props)
  return (
    <section>
      <h1 className="text-display">{q ? `Results for “${q}”` : 'Search'}</h1>
      {q ? (
        <Suspense>
          <ProductListing q={q} />
        </Suspense>
      ) : (
        <p className="mt-4 max-w-[52ch] text-lg text-ink">
          Type what you are looking for in the search box above.
        </p>
      )}
    </section>
  )
}
