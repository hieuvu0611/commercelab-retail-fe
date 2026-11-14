import type { CategoryNode, Product, ProductDetail, ProductListItem } from '@/types/catalog'

/** Storefront queries of the mock backend (GET /products, GET /products/{slug}): published products only. */

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100

const pricedSkus = (product: Product) =>
  product.skus.filter((sku) => sku.isActive && sku.unitPriceVnd !== null)

export const isOnShelf = (product: Product): boolean =>
  product.status === 'PUBLISHED' && pricedSkus(product).length > 0

function categoryPathOf(product: Product, categories: CategoryNode[]): string | null {
  return categories.find((node) => node.id === product.primaryCategoryId)?.path ?? null
}

function inCategory(product: Product, categories: CategoryNode[], path: string): boolean {
  return product.categoryIds.some((id) => {
    const nodePath = categories.find((node) => node.id === id)?.path
    return nodePath !== undefined && (nodePath === path || nodePath.startsWith(`${path}/`))
  })
}

function toItem(product: Product): ProductListItem {
  const prices = pricedSkus(product).map((sku) => sku.unitPriceVnd as number)
  const attributes: Record<string, string[]> = {}
  for (const sku of pricedSkus(product)) {
    for (const [axis, value] of Object.entries(sku.attributes)) {
      attributes[axis] = [...new Set([...(attributes[axis] ?? []), value])]
    }
  }
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    imageUrl: product.images[0]?.url ?? null,
    minPriceVnd: Math.min(...prices),
    maxPriceVnd: Math.max(...prices),
    attributes,
  }
}

function toNumber(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : undefined
}

export function listProducts(
  products: Product[],
  categories: CategoryNode[],
  query: Record<string, string | undefined>
): { items: ProductListItem[]; total: number; page: number; pageCount: number; limit: number } {
  const needle = (query.q ?? '').trim().toLowerCase()
  const minPrice = toNumber(query.minPrice)
  const maxPrice = toNumber(query.maxPrice)
  const attrFilters = Object.entries(query)
    .filter(([key, value]) => key.startsWith('attr.') && value)
    .map(([key, value]) => [key.slice(5), (value as string).split(',')] as const)

  const matching = products.filter(isOnShelf).filter((product) => {
    if (query.category && !inCategory(product, categories, query.category)) return false
    if (needle && !`${product.name} ${product.brand}`.toLowerCase().includes(needle)) return false
    const skus = pricedSkus(product).filter(
      (sku) =>
        (minPrice === undefined || (sku.unitPriceVnd as number) >= minPrice) &&
        (maxPrice === undefined || (sku.unitPriceVnd as number) <= maxPrice) &&
        attrFilters.every(([axis, values]) => values.includes(sku.attributes[axis]))
    )
    return skus.length > 0
  })

  const items = matching.map(toItem)
  const byNewest = (a: ProductListItem, b: ProductListItem) =>
    (products.find((p) => p.id === b.id)?.createdAt ?? '').localeCompare(
      products.find((p) => p.id === a.id)?.createdAt ?? ''
    )
  items.sort(
    query.sort === 'price_asc'
      ? (a, b) => a.minPriceVnd - b.minPriceVnd
      : query.sort === 'price_desc'
        ? (a, b) => b.minPriceVnd - a.minPriceVnd
        : byNewest
  )

  const limit = Math.min(Math.max(Math.trunc(toNumber(query.limit) ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const pageCount = Math.max(Math.ceil(items.length / limit), 1)
  const page = Math.min(Math.max(Math.trunc(toNumber(query.page) ?? 1), 1), pageCount)
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    pageCount,
    limit,
  }
}

export function productDetail(
  products: Product[],
  categories: CategoryNode[],
  slug: string
): ProductDetail | undefined {
  const product = products.find((candidate) => candidate.slug === slug && isOnShelf(candidate))
  if (!product) return undefined
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    brand: product.brand,
    categoryPath: categoryPathOf(product, categories),
    variantAxes: product.variantAxes,
    specs: product.specs,
    images: product.images,
    skus: pricedSkus(product).map((sku) => ({
      skuId: sku.skuId,
      attributes: sku.attributes,
      unitPriceVnd: sku.unitPriceVnd as number,
      isActive: sku.isActive,
    })),
    availability: 'unknown',
  }
}
