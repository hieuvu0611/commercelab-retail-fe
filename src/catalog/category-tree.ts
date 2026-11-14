import type { BreadcrumbEntry, CategoryNode } from '@/types/catalog'

export const CATEGORY_ROUTE_PREFIX = '/c'

export function categoryHref(path: string): string {
  return `${CATEGORY_ROUTE_PREFIX}/${path}`
}

/** The chain of categories from the top level down to the one at `path`, or undefined when a segment is unknown. */
export function categoryChain(tree: CategoryNode[], path: string): CategoryNode[] | undefined {
  const segments = path.split('/').filter(Boolean)
  const chain: CategoryNode[] = []
  let level = tree
  for (const segment of segments) {
    const node = level.find((candidate) => candidate.slug === segment)
    if (!node) return undefined
    chain.push(node)
    level = node.children
  }
  return chain.length > 0 ? chain : undefined
}

/** Breadcrumb entries for a category: Home, each ancestor as a link, the category itself as the current page. */
export function categoryBreadcrumb(chain: CategoryNode[]): BreadcrumbEntry[] {
  return [
    { label: 'Home', href: '/' },
    ...chain.map((node, index) =>
      index === chain.length - 1
        ? { label: node.name }
        : { label: node.name, href: categoryHref(node.path) }
    ),
  ]
}
