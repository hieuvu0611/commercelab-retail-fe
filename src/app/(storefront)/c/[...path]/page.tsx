import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { categoryBreadcrumb, categoryChain, categoryHref } from '@/catalog/category-tree'
import { fetchCategoryTreeOrNull } from '@/catalog/server-api'
import { CatalogBreadcrumb } from '@/components/catalog/catalog-breadcrumb'

interface PageProps {
  params: Promise<{ path: string[] }>
}

async function loadChain(path: string[]) {
  const tree = await fetchCategoryTreeOrNull()
  return tree ? categoryChain(tree, path.join('/')) : undefined
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const chain = await loadChain((await params).path)
  return { title: chain ? `${chain[chain.length - 1].name} — CommerceLab Retail` : 'Category' }
}

export default async function CategoryPage({ params }: PageProps) {
  const chain = await loadChain((await params).path)
  if (!chain) notFound()
  const category = chain[chain.length - 1]

  return (
    <section>
      <CatalogBreadcrumb entries={categoryBreadcrumb(chain)} />
      <h1 className="mt-4 text-display">{category.name}</h1>
      {category.children.length > 0 && (
        <ul aria-label="Subcategories" className="mt-6 flex flex-wrap gap-3">
          {category.children.map((child) => (
            <li key={child.id}>
              <Link href={categoryHref(child.path)} className="btn btn-secondary">
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
