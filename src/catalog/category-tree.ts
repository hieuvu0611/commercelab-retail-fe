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

/**
 * Breadcrumb entries for a category: Home, each ancestor as a link, then the current page. The current page is
 * the category itself, or `currentLabel` (for example a product name) when given, in which case the whole chain links.
 */
export function categoryBreadcrumb(
  chain: CategoryNode[],
  currentLabel?: string
): BreadcrumbEntry[] {
  const links = currentLabel === undefined ? chain.slice(0, -1) : chain
  const current = currentLabel ?? chain[chain.length - 1].name
  return [
    { label: 'Home', href: '/' },
    ...links.map((node) => ({ label: node.name, href: categoryHref(node.path) })),
    { label: current },
  ]
}
