import type { CategoryNode } from '@/types/catalog'
import { categoryBreadcrumb, categoryChain, categoryHref } from '../category-tree'

const node = (slug: string, path: string, children: CategoryNode[] = []): CategoryNode => ({
  id: slug,
  parentId: null,
  name: slug.toUpperCase(),
  slug,
  path,
  depth: path.split('/').length,
  sortOrder: 0,
  isActive: true,
  children,
})

const tree = [
  node('backpacks', 'backpacks', [node('city', 'backpacks/city')]),
  node('bottles', 'bottles'),
]

describe('categoryChain', () => {
  it('returns the ancestors down to the category', () => {
    expect(categoryChain(tree, 'backpacks/city')?.map((n) => n.slug)).toEqual(['backpacks', 'city'])
  })

  it('returns undefined when a segment is unknown', () => {
    expect(categoryChain(tree, 'backpacks/nope')).toBeUndefined()
    expect(categoryChain(tree, '')).toBeUndefined()
  })
})

describe('categoryBreadcrumb', () => {
  it('links ancestors and leaves the current category without a link', () => {
    const chain = categoryChain(tree, 'backpacks/city')!
    expect(categoryBreadcrumb(chain)).toEqual([
      { label: 'Home', href: '/' },
      { label: 'BACKPACKS', href: '/c/backpacks' },
      { label: 'CITY' },
    ])
  })
})

describe('categoryBreadcrumb with a current label', () => {
  it('links the whole chain and ends on the label', () => {
    const chain = categoryChain(tree, 'backpacks/city')!
    expect(categoryBreadcrumb(chain, 'City Backpack').slice(-2)).toEqual([
      { label: 'CITY', href: '/c/backpacks/city' },
      { label: 'City Backpack' },
    ])
  })
})

describe('categoryHref', () => {
  it('prefixes the storefront route', () => {
    expect(categoryHref('bottles/sports')).toBe('/c/bottles/sports')
  })
})
