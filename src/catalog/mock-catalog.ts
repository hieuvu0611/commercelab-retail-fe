import type { CategoryNode, PriceEntry, Product } from '@/types/catalog'
import {
  CatalogError,
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
} from './mock-category-admin'
import * as priceAdmin from './mock-price-admin'
import * as productAdmin from './mock-product-admin'
import { seedProducts } from './mock-products'
import { listProducts, productDetail } from './mock-storefront'
import type { MockRequest, MockResponse } from '@/auth/mock-api'

/** Catalogue part of the in-app mock backend (/mock-api). Mirrors the Phase 2 API contract. */

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({
  status,
  body: { message, code, status, ...(errors && { errors }) },
})

const PRODUCT_STAFF = 'PRODUCT_STAFF'
const MARKETING = 'MARKETING'

type SeedCategory = [name: string, slug: string, children?: SeedCategory[]]

const SEED: SeedCategory[] = [
  [
    'Backpacks',
    'backpacks',
    [
      ['City', 'city', [['Laptop packs', 'laptop']]],
      ['Travel', 'travel'],
      ['Hiking', 'hiking'],
    ],
  ],
  [
    'Bottles',
    'bottles',
    [
      ['Insulated', 'insulated'],
      ['Sports', 'sports'],
    ],
  ],
  [
    'Travel accessories',
    'travel-accessories',
    [
      ['Packing cubes', 'packing-cubes'],
      ['Locks', 'locks'],
      ['Pouches', 'pouches'],
    ],
  ],
]

function build(
  items: SeedCategory[],
  parent: CategoryNode | null,
  all: CategoryNode[]
): CategoryNode[] {
  return items.map(([name, slug, children], index) => {
    const node: CategoryNode = {
      id: `cat-${slug}`,
      parentId: parent?.id ?? null,
      name,
      slug,
      path: parent ? `${parent.path}/${slug}` : slug,
      depth: (parent?.depth ?? 0) + 1,
      sortOrder: index,
      isActive: true,
      children: [],
    }
    all.push(node)
    node.children = build(children ?? [], node, all)
    return node
  })
}

export interface MockCatalogState {
  categories: CategoryNode[]
  products: Product[]
  /** Price entries per SKU; a SKU without an entry has its seeded price since the seed date. */
  prices: Record<string, PriceEntry[]>
}

export function createMockCatalogState(): MockCatalogState {
  const flat: CategoryNode[] = []
  build(SEED, null, flat)
  return {
    categories: flat.map((node) => ({ ...node, children: [] })),
    products: seedProducts(),
    prices: {},
  }
}

const globalForCatalog = globalThis as unknown as { __mockCatalogState?: MockCatalogState }

export function getMockCatalogState(): MockCatalogState {
  globalForCatalog.__mockCatalogState ??= createMockCatalogState()
  return globalForCatalog.__mockCatalogState
}

/** Nests a flat category list under `parentId`, ordered by sortOrder. */
export function nestCategories(
  flat: CategoryNode[],
  parentId: string | null,
  includeInactive = false
): CategoryNode[] {
  return flat
    .filter((node) => node.parentId === parentId && (includeInactive || node.isActive))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((node) => ({ ...node, children: nestCategories(flat, node.id, includeInactive) }))
}

/** Returns a response for a catalogue endpoint, or null when the request is not a catalogue request. */
export function handleCatalogMock(
  request: MockRequest,
  roles: string[] | null = null,
  state: MockCatalogState = getMockCatalogState()
): MockResponse | null {
  const { method, path } = request

  if (path.startsWith('/admin/categories')) return handleCategoryAdmin(request, roles, state)
  if (path === '/admin/prices' || path.startsWith('/admin/skus/'))
    return handlePriceAdmin(request, roles, state)
  if (path.startsWith('/admin/products')) return handleProductAdmin(request, roles, state)
  if (method === 'PUT' && path.startsWith('/uploads/')) return ok({}, 'Uploaded')

  if (method === 'GET' && path === '/categories') return ok(nestCategories(state.categories, null))

  const categoryPath = path.match(/^\/categories\/(.+)$/)
  if (method === 'GET' && categoryPath) {
    const found = state.categories.find((node) => node.isActive && node.path === categoryPath[1])
    if (!found) return failure(404, 'NOT_FOUND', 'Category not found')
    return ok({ ...found, children: nestCategories(state.categories, found.id) })
  }

  if (method === 'GET' && path === '/products') {
    const { items, ...metadata } = listProducts(
      state.products,
      state.categories,
      request.query ?? {}
    )
    return { status: 200, body: { message: 'Products retrieved', data: items, metadata } }
  }

  const productSlug = path.match(/^\/products\/([^/]+)$/)
  if (method === 'GET' && productSlug) {
    const detail = productDetail(state.products, state.categories, productSlug[1])
    return detail ? ok(detail) : failure(404, 'NOT_FOUND', 'Product not found')
  }

  return null
}

function handleCategoryAdmin(
  request: MockRequest,
  roles: string[] | null,
  state: MockCatalogState
): MockResponse {
  if (!roles) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!roles.includes(PRODUCT_STAFF))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

  const { method, path } = request
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  try {
    if (method === 'GET' && path === '/admin/categories')
      return ok(nestCategories(state.categories, null, true))
    if (method === 'POST' && path === '/admin/categories')
      return ok(createCategory(state, body), 'Category created', 201)
    const target = path.match(/^\/admin\/categories\/([^/]+)(\/move)?$/)
    if (target) {
      const [, id, move] = target
      if (method === 'PATCH' && !move)
        return ok(updateCategory(state, id, body), 'Category updated')
      if (method === 'POST' && move) return ok(moveCategory(state, id, body), 'Category moved')
      if (method === 'DELETE' && !move) {
        deleteCategory(state, id)
        return ok({}, 'Category deleted')
      }
    }
  } catch (error) {
    if (error instanceof CatalogError)
      return failure(error.status, error.code, error.code, error.errors)
    throw error
  }
  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}

function guardStaff(roles: string[] | null): MockResponse | null {
  if (!roles) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!roles.includes(PRODUCT_STAFF))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')
  return null
}

function handleProductAdmin(
  request: MockRequest,
  roles: string[] | null,
  state: MockCatalogState
): MockResponse {
  const denied = guardStaff(roles)
  if (denied) return denied

  const { method, path } = request
  const body: Record<string, unknown> = {
    // DELETE has no body, so its version travels in the query string.
    ...(request.query?.version && { version: Number(request.query.version) }),
    ...(request.body !== null && typeof request.body === 'object' && (request.body as object)),
  }
  try {
    if (path === '/admin/products') {
      if (method === 'GET') {
        const { items, ...metadata } = productAdmin.listAdminProducts(state, request.query ?? {})
        return { status: 200, body: { message: 'Products retrieved', data: items, metadata } }
      }
      if (method === 'POST')
        return ok(productAdmin.createProduct(state, body), 'Product created', 201)
    }
    const route = path.match(/^\/admin\/products\/([^/]+)(?:\/(.+))?$/)
    if (route) {
      const [, id, rest] = route
      const sku = rest?.match(/^skus(?:\/([^/]+))?$/)
      const image = rest?.match(/^images(?:\/([^/]+))?$/)
      if (!rest && method === 'GET') return ok(productAdmin.getProduct(state, id))
      if (!rest && method === 'PATCH')
        return ok(productAdmin.patchProduct(state, id, body), 'Product updated')
      if (sku && !sku[1] && method === 'POST')
        return ok(productAdmin.addSku(state, id, body), 'SKU added', 201)
      if (sku?.[1] && method === 'PATCH')
        return ok(productAdmin.patchSku(state, id, sku[1], body), 'SKU updated')
      if (sku?.[1] && method === 'DELETE')
        return ok(productAdmin.deleteSku(state, id, sku[1], body), 'SKU removed')
      if (rest === 'images/upload-url' && method === 'POST')
        return ok(productAdmin.createUploadUrl(state, id, body))
      if (rest === 'images/order' && method === 'PUT')
        return ok(productAdmin.reorderImages(state, id, body), 'Images reordered')
      if (image && !image[1] && method === 'POST')
        return ok(productAdmin.attachImage(state, id, body), 'Image added', 201)
      if (image?.[1] && method === 'DELETE')
        return ok(productAdmin.removeImage(state, id, image[1], body), 'Image removed')
      if (
        rest &&
        method === 'POST' &&
        ['submit-review', 'publish', 'reject', 'unpublish'].includes(rest)
      )
        return ok(
          productAdmin.runWorkflow(state, id, rest as productAdmin.WorkflowAction, body),
          'Status updated'
        )
    }
  } catch (error) {
    if (error instanceof CatalogError)
      return failure(error.status, error.code, error.code, error.errors)
    throw error
  }
  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}

function handlePriceAdmin(
  request: MockRequest,
  roles: string[] | null,
  state: MockCatalogState
): MockResponse {
  if (!roles) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!roles.includes(MARKETING))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

  const { method, path } = request
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  try {
    if (method === 'GET' && path === '/admin/prices') {
      const { items, ...metadata } = priceAdmin.listPrices(state, request.query ?? {})
      return { status: 200, body: { message: 'Prices retrieved', data: items, metadata } }
    }
    const sku = path.match(/^\/admin\/skus\/([^/]+)\/price$/)
    if (sku) {
      const skuId = decodeURIComponent(sku[1])
      if (method === 'PUT') return ok(priceAdmin.setPrice(state, skuId, body), 'Price saved')
      if (method === 'GET') return ok(priceAdmin.priceHistory(state, skuId))
    }
  } catch (error) {
    if (error instanceof CatalogError)
      return failure(error.status, error.code, error.code, error.errors)
    throw error
  }
  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
