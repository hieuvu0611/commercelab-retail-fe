import type { CategoryNode } from '@/types/catalog'
import type { MockCatalogState } from './mock-catalog'
import { slugify } from './mock-products'

/** Category rules of the backoffice API (P2-T01/T02): depth <= 3, no cycles, unique slug among siblings. */

export const MAX_CATEGORY_DEPTH = 3
const MAX_NAME_LENGTH = 80

export class CatalogError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly errors?: Record<string, string[]>
  ) {
    super(code)
  }
}

const invalid = (field: string, message: string): never => {
  throw new CatalogError(422, 'VALIDATION_FAILED', { [field]: [message] })
}

const byId = (flat: CategoryNode[], id: string) => flat.find((node) => node.id === id)

function descendantsOf(flat: CategoryNode[], id: string): CategoryNode[] {
  const children = flat.filter((node) => node.parentId === id)
  return children.flatMap((child) => [child, ...descendantsOf(flat, child.id)])
}

function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) return invalid('name', 'Name is required')
  if (name.length > MAX_NAME_LENGTH)
    return invalid('name', `Name must be at most ${MAX_NAME_LENGTH} characters`)
  return name
}

function assertUniqueName(
  flat: CategoryNode[],
  parentId: string | null,
  name: string,
  selfId?: string
) {
  const clash = flat.some(
    (node) =>
      node.id !== selfId &&
      node.parentId === parentId &&
      node.name.toLowerCase() === name.toLowerCase()
  )
  if (clash)
    throw new CatalogError(409, 'CATEGORY_SLUG_CONFLICT', {
      name: ['A category with this name already exists here'],
    })
}

/** Recomputes path and depth of `rootId` and everything below it after a rename or move. */
function repath(flat: CategoryNode[], rootId: string): CategoryNode[] {
  const next = flat.map((node) => ({ ...node }))
  const visit = (id: string) => {
    const node = byId(next, id)!
    const parent = node.parentId ? byId(next, node.parentId) : undefined
    node.path = parent ? `${parent.path}/${node.slug}` : node.slug
    node.depth = (parent?.depth ?? 0) + 1
    next.filter((child) => child.parentId === id).forEach((child) => visit(child.id))
  }
  visit(rootId)
  return next
}

function resolveParent(flat: CategoryNode[], parentId: unknown): CategoryNode | null {
  if (parentId === null || parentId === undefined || parentId === '') return null
  const parent = typeof parentId === 'string' ? byId(flat, parentId) : undefined
  if (!parent) return invalid('parentId', 'Parent category does not exist')
  return parent
}

function nextSortOrder(flat: CategoryNode[], parentId: string | null): number {
  return (
    Math.max(
      -1,
      ...flat.filter((node) => node.parentId === parentId).map((node) => node.sortOrder)
    ) + 1
  )
}

export function createCategory(
  state: MockCatalogState,
  input: { name?: unknown; parentId?: unknown }
): CategoryNode {
  const name = cleanName(input.name)
  const parent = resolveParent(state.categories, input.parentId)
  if ((parent?.depth ?? 0) + 1 > MAX_CATEGORY_DEPTH)
    invalid('parentId', `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep`)
  assertUniqueName(state.categories, parent?.id ?? null, name)
  const slug = slugify(name)
  if (!slug) return invalid('name', 'Name must contain letters or digits')
  const node: CategoryNode = {
    id: `cat-${slug}-${state.categories.length + 1}`,
    parentId: parent?.id ?? null,
    name,
    slug,
    path: parent ? `${parent.path}/${slug}` : slug,
    depth: (parent?.depth ?? 0) + 1,
    sortOrder: nextSortOrder(state.categories, parent?.id ?? null),
    isActive: true,
    children: [],
  }
  state.categories = [...state.categories, node]
  return node
}

export function updateCategory(
  state: MockCatalogState,
  id: string,
  input: { name?: unknown; isActive?: unknown }
): CategoryNode {
  const current = byId(state.categories, id)
  if (!current) throw new CatalogError(404, 'NOT_FOUND')
  const name = input.name === undefined ? current.name : cleanName(input.name)
  if (input.name !== undefined) assertUniqueName(state.categories, current.parentId, name, id)
  const isActive = typeof input.isActive === 'boolean' ? input.isActive : current.isActive
  state.categories = state.categories.map((node) =>
    node.id === id ? { ...node, name, isActive } : node
  )
  return byId(state.categories, id)!
}

export function moveCategory(
  state: MockCatalogState,
  id: string,
  input: { parentId?: unknown }
): CategoryNode {
  const current = byId(state.categories, id)
  if (!current) throw new CatalogError(404, 'NOT_FOUND')
  const parent = resolveParent(state.categories, input.parentId)
  const subtree = descendantsOf(state.categories, id)
  if (parent && (parent.id === id || subtree.some((node) => node.id === parent.id)))
    throw new CatalogError(409, 'CATEGORY_CYCLE', {
      parentId: ['A category cannot be moved under itself or its own subcategory'],
    })
  const height = Math.max(0, ...subtree.map((node) => node.depth - current.depth))
  if ((parent?.depth ?? 0) + 1 + height > MAX_CATEGORY_DEPTH)
    invalid('parentId', `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep`)
  assertUniqueName(state.categories, parent?.id ?? null, current.name, id)
  const parentId = parent?.id ?? null
  const sortOrder =
    parentId === current.parentId ? current.sortOrder : nextSortOrder(state.categories, parentId)
  state.categories = repath(
    state.categories.map((node) => (node.id === id ? { ...node, parentId, sortOrder } : node)),
    id
  )
  return byId(state.categories, id)!
}

export function deleteCategory(state: MockCatalogState, id: string): void {
  if (!byId(state.categories, id)) throw new CatalogError(404, 'NOT_FOUND')
  const hasChildren = state.categories.some((node) => node.parentId === id)
  const hasProducts = state.products.some((product) => product.categoryIds.includes(id))
  if (hasChildren || hasProducts) throw new CatalogError(409, 'CATEGORY_NOT_EMPTY')
  state.categories = state.categories.filter((node) => node.id !== id)
}
