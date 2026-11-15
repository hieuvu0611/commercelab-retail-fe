import type { Product, ProductImage, ProductPatch, Sku, UploadUrl } from '@/types/catalog'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/types/catalog'
import type { MockCatalogState } from './mock-catalog'
import { CatalogError } from './mock-category-admin'
import { placeholderImage, slugify } from './mock-products'

/** Product rules of the backoffice API (P2-T03 to T07): drafts, optimistic version, SKUs, images, workflow. */

type Body = Record<string, unknown>

const fail = (status: number, code: string, errors?: Record<string, string[]>): never => {
  throw new CatalogError(status, code, errors)
}
const invalid = (field: string, message: string): never =>
  fail(422, 'VALIDATION_FAILED', { [field]: [message] })

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function findProduct(state: MockCatalogState, id: string): Product {
  return state.products.find((product) => product.id === id) ?? fail(404, 'NOT_FOUND')
}

/** Replaces a product, bumping its version and update time. Callers pass the version the client loaded. */
function save(state: MockCatalogState, current: Product, change: Partial<Product>): Product {
  const next: Product = {
    ...current,
    ...change,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  }
  state.products = state.products.map((product) => (product.id === current.id ? next : product))
  return next
}

function checkVersion(current: Product, body: Body) {
  if (typeof body.version === 'number' && body.version !== current.version)
    fail(409, 'VERSION_CONFLICT')
}

function assertEditable(product: Product) {
  if (product.status === 'IN_REVIEW') fail(409, 'PRODUCT_NOT_EDITABLE')
}

export function createProduct(state: MockCatalogState, body: Body): Product {
  const name = text(body.name)
  if (!name) return invalid('name', 'Name is required')
  const base = slugify(name) || 'product'
  let slug = base
  for (let n = 2; state.products.some((product) => product.slug === slug); n += 1)
    slug = `${base}-${n}`
  const now = new Date().toISOString()
  const product: Product = {
    id: `prod-${slug}`,
    slug,
    name,
    description: text(body.description),
    brand: text(body.brand),
    primaryCategoryId: null,
    categoryIds: [],
    variantAxes: [],
    specs: {},
    images: [],
    status: 'DRAFT',
    version: 1,
    skus: [],
    createdAt: now,
    updatedAt: now,
  }
  state.products = [...state.products, product]
  return product
}

export function listAdminProducts(
  state: MockCatalogState,
  query: Record<string, string | undefined>
) {
  const needle = (query.q ?? '').trim().toLowerCase()
  const matching = state.products
    .filter((product) => !query.status || product.status === query.status)
    .filter(
      (product) => !needle || `${product.name} ${product.brand}`.toLowerCase().includes(needle)
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100)
  const pageCount = Math.max(Math.ceil(matching.length / limit), 1)
  const page = Math.min(Math.max(Number(query.page) || 1, 1), pageCount)
  return {
    items: matching.slice((page - 1) * limit, page * limit).map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      status: product.status,
      version: product.version,
      skuCount: product.skus.length,
      updatedAt: product.updatedAt,
    })),
    total: matching.length,
    page,
    pageCount,
    limit,
  }
}

export const getProduct = findProduct

export function patchProduct(
  state: MockCatalogState,
  id: string,
  body: Body & Partial<ProductPatch>
): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  const change: Partial<Product> = {}
  if (body.name !== undefined) change.name = text(body.name) || invalid('name', 'Name is required')
  if (body.description !== undefined) change.description = text(body.description)
  if (body.brand !== undefined) change.brand = text(body.brand)
  if (body.specs !== undefined && typeof body.specs === 'object' && body.specs !== null)
    change.specs = Object.fromEntries(
      Object.entries(body.specs)
        .map(([key, value]) => [key.trim(), text(value)])
        .filter(([key]) => key)
    )
  if (body.primaryCategoryId !== undefined || body.categoryIds !== undefined) {
    const known = new Set(state.categories.map((category) => category.id))
    const primary =
      (body.primaryCategoryId as string | null | undefined) ?? current.primaryCategoryId
    const ids = [
      ...new Set([...(body.categoryIds ?? current.categoryIds), ...(primary ? [primary] : [])]),
    ]
    if (ids.some((categoryId) => !known.has(categoryId))) invalid('categoryIds', 'Unknown category')
    change.primaryCategoryId = primary
    change.categoryIds = ids
  }
  if (body.variantAxes !== undefined) {
    const axes = (body.variantAxes as unknown[]).map(text).filter(Boolean)
    if (new Set(axes).size !== axes.length) invalid('variantAxes', 'Variant axes must be unique')
    if (current.skus.length > 0 && axes.join('|') !== current.variantAxes.join('|'))
      fail(409, 'VARIANT_AXES_LOCKED', {
        variantAxes: ['Remove the SKUs before changing the variant axes'],
      })
    change.variantAxes = axes
  }
  return save(state, current, change)
}

function skuProblems(
  state: MockCatalogState,
  product: Product,
  skuId: string,
  attributes: Record<string, string>,
  selfId?: string
) {
  if (!skuId) invalid('skuId', 'SKU code is required')
  if (state.products.some((p) => p.skus.some((sku) => sku.skuId === skuId && sku.skuId !== selfId)))
    fail(409, 'SKU_CODE_CONFLICT', { skuId: ['This SKU code is already used'] })
  const missing = product.variantAxes.filter((axis) => !attributes[axis])
  if (product.variantAxes.length === 0)
    invalid('attributes', 'Define the variant axes before adding SKUs')
  if (missing.length > 0) invalid('attributes', `Choose a value for ${missing.join(', ')}`)
  const same = product.skus.find(
    (sku) =>
      sku.skuId !== selfId &&
      product.variantAxes.every((axis) => sku.attributes[axis] === attributes[axis])
  )
  if (same)
    fail(409, 'SKU_COMBINATION_CONFLICT', {
      attributes: ['A SKU with this combination already exists'],
    })
}

const attributesOf = (value: unknown): Record<string, string> =>
  value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, text(entry)]))
    : {}

export function addSku(state: MockCatalogState, id: string, body: Body): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  const skuId = text(body.skuId).toUpperCase()
  const attributes = attributesOf(body.attributes)
  skuProblems(state, current, skuId, attributes)
  const sku: Sku = { skuId, attributes, isActive: body.isActive !== false, unitPriceVnd: null }
  return save(state, current, { skus: [...current.skus, sku] })
}

export function patchSku(state: MockCatalogState, id: string, skuId: string, body: Body): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  const existing = current.skus.find((sku) => sku.skuId === skuId) ?? fail(404, 'NOT_FOUND')
  const attributes =
    body.attributes === undefined ? existing.attributes : attributesOf(body.attributes)
  if (body.attributes !== undefined) skuProblems(state, current, skuId, attributes, skuId)
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : existing.isActive
  return save(state, current, {
    skus: current.skus.map((sku) => (sku.skuId === skuId ? { ...sku, attributes, isActive } : sku)),
  })
}

export function deleteSku(state: MockCatalogState, id: string, skuId: string, body: Body): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  if (!current.skus.some((sku) => sku.skuId === skuId)) fail(404, 'NOT_FOUND')
  return save(state, current, { skus: current.skus.filter((sku) => sku.skuId !== skuId) })
}

export function createUploadUrl(state: MockCatalogState, id: string, body: Body): UploadUrl {
  findProduct(state, id)
  const contentType = text(body.contentType)
  const size = Number(body.sizeBytes)
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType))
    invalid('contentType', 'Use a JPEG, PNG or WebP image')
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES)
    invalid('sizeBytes', 'The image must be 5 MB or smaller')
  const objectKey = `products/${id}/${Date.now()}-${slugify(contentType)}`
  // Mock mode cannot keep the bytes; the attached image is a labelled placeholder.
  return { uploadUrl: `/mock-api/uploads/${objectKey}`, objectKey, headers: {} }
}

export function attachImage(state: MockCatalogState, id: string, body: Body): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  const key = text(body.key)
  if (!key.startsWith(`products/${id}/`)) invalid('key', 'Upload an image first')
  const image: ProductImage = {
    id: `img-${Date.now()}-${current.images.length}`,
    url: placeholderImage(current.name),
    alt: text(body.alt) || current.name,
  }
  return save(state, current, { images: [...current.images, image] })
}

export function reorderImages(state: MockCatalogState, id: string, body: Body): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  const order = Array.isArray(body.imageIds) ? (body.imageIds as string[]) : []
  const sameSet =
    order.length === current.images.length &&
    current.images.every((image) => order.includes(image.id))
  if (!sameSet) invalid('imageIds', 'Send every image id exactly once')
  return save(state, current, {
    images: order.map((imageId) => current.images.find((image) => image.id === imageId)!),
  })
}

export function removeImage(
  state: MockCatalogState,
  id: string,
  imageId: string,
  body: Body
): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  assertEditable(current)
  if (!current.images.some((image) => image.id === imageId)) fail(404, 'NOT_FOUND')
  return save(state, current, { images: current.images.filter((image) => image.id !== imageId) })
}

/** Field-level problems that block publishing (P2-T05). Empty when the product can go live. */
export function publishProblems(
  state: MockCatalogState,
  product: Product
): Record<string, string[]> {
  const problems: Record<string, string[]> = {}
  const add = (field: string, message: string) =>
    (problems[field] = [...(problems[field] ?? []), message])
  if (!product.name.trim()) add('name', 'Add a product name')
  if (!product.description.trim()) add('description', 'Add a description')
  if (!product.primaryCategoryId) add('primaryCategoryId', 'Choose a primary category')
  if (product.images.length === 0) add('images', 'Add at least one image')
  const active = product.skus.filter((sku) => sku.isActive)
  if (active.length === 0) add('skus', 'Add at least one active SKU')
  for (const sku of active.filter((entry) => entry.unitPriceVnd === null))
    add('skus', `SKU ${sku.skuId} has no active price`)
  for (const sku of product.skus) {
    const clash = state.products.some(
      (p) => p.id !== product.id && p.skus.some((other) => other.skuId === sku.skuId)
    )
    if (clash) add('skus', `SKU code ${sku.skuId} is also used by another product`)
  }
  return problems
}

export type WorkflowAction = 'submit-review' | 'publish' | 'reject' | 'unpublish'

const TRANSITIONS: Record<WorkflowAction, { from: Product['status'][]; to: Product['status'] }> = {
  'submit-review': { from: ['DRAFT', 'UNPUBLISHED'], to: 'IN_REVIEW' },
  publish: { from: ['IN_REVIEW'], to: 'PUBLISHED' },
  reject: { from: ['IN_REVIEW'], to: 'DRAFT' },
  unpublish: { from: ['PUBLISHED'], to: 'UNPUBLISHED' },
}

export function runWorkflow(
  state: MockCatalogState,
  id: string,
  action: WorkflowAction,
  body: Body
): Product {
  const current = findProduct(state, id)
  checkVersion(current, body)
  const { from, to } = TRANSITIONS[action]
  if (!from.includes(current.status)) fail(409, 'INVALID_STATE')
  if (action === 'reject' && !text(body.reason))
    invalid('reason', 'Give a reason for the rejection')
  if (action === 'publish') {
    const problems = publishProblems(state, current)
    if (Object.keys(problems).length > 0) fail(422, 'PUBLISH_VALIDATION_FAILED', problems)
  }
  return save(state, current, {
    status: to,
    rejectionReason: action === 'reject' ? text(body.reason) : undefined,
  })
}
