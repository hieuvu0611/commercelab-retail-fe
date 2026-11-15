import type {
  AdminProductSummary,
  CategoryNode,
  PriceEntry,
  Product,
  ProductDetail,
  ProductListItem,
  SkuPriceRow,
  StorefrontSku,
  UploadUrl,
} from '@/types/catalog'
import { summarizeAvailability, toAvailability, toListAvailability } from '@/inventory/adapters'

// The catalogue service (be, catalog-pricing-service) and this app describe a few things differently. These
// functions translate the service's JSON into the app's types in one place. They also accept the app's own
// shape, so the in-app mock backend (which mirrors the app's types) passes through unchanged.

type Raw = object

const ISO_DATE_LENGTH = 10

/** "City Backpack" becomes "city-backpack": the slug rules of the service (lowercase letters, digits, single hyphens). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

const withoutLeadingSlash = (path: string) => path.replace(/^\/+/, '')

/** Category tree: paths lose their leading slash and every node carries parentId and isActive. */
export function normalizeTree(
  nodes: CategoryNode[] | null,
  parentId: string | null = null
): CategoryNode[] {
  return (nodes ?? []).map((node) => ({
    ...node,
    parentId: node.parentId ?? parentId,
    isActive: node.isActive ?? true,
    path: withoutLeadingSlash(node.path),
    children: normalizeTree(node.children, node.id),
  }))
}

interface FlatCategory {
  id: string
  parentId?: string | null
  name: string
  slug: string
  path: string
  depth: number
  sortOrder: number
  isActive: boolean
}

/** The admin category list (flat, inactive included) as a tree, siblings by sortOrder then name. */
export function categoriesFromList(
  list: Array<FlatCategory | CategoryNode> | null
): CategoryNode[] {
  const items = list ?? []
  if (items.some((item) => 'children' in item && Array.isArray(item.children))) {
    return normalizeTree(items as CategoryNode[])
  }
  const build = (parentId: string | null): CategoryNode[] =>
    (items as FlatCategory[])
      .filter((item) => (item.parentId || null) === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((item) => ({
        id: item.id,
        parentId,
        name: item.name,
        slug: item.slug,
        path: withoutLeadingSlash(item.path),
        depth: item.depth,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        children: build(item.id),
      }))
  return build(null)
}

/** Product card: the service lists variant values as `options`. */
export function toListItem(raw: Raw): ProductListItem {
  const item = raw as unknown as ProductListItem & { options?: Record<string, string[]> }
  const { options, ...rest } = item
  return {
    ...rest,
    imageUrl: item.imageUrl ?? null,
    attributes: item.attributes ?? options ?? {},
    availability: toListAvailability(item.availability),
  }
}

/**
 * Product page: SKUs that cannot be ordered now (no price) are left out, so their combinations stay disabled.
 * A missing or unrecognised availability becomes "unknown".
 */
export function toProductDetail(raw: Raw): ProductDetail {
  const detail = raw as unknown as ProductDetail & {
    skus: Array<
      StorefrontSku | (Omit<StorefrontSku, 'unitPriceVnd'> & { unitPriceVnd: number | null })
    >
  }
  const skus: StorefrontSku[] = detail.skus.flatMap((sku) =>
    sku.unitPriceVnd === null
      ? []
      : [
          {
            ...sku,
            isActive: sku.isActive ?? true,
            unitPriceVnd: sku.unitPriceVnd,
            availability: toAvailability(sku.availability),
          },
        ]
  )
  return {
    ...detail,
    categoryPath: detail.categoryPath ?? null,
    specs: detail.specs ?? {},
    images: detail.images ?? [],
    variantAxes: detail.variantAxes ?? [],
    skus,
    availability: summarizeAvailability(skus.map((sku) => sku.availability ?? 'unknown')),
  } as ProductDetail
}

/** Admin product: the service sends no prices with the SKUs and may send null for empty lists. */
export function toAdminProduct(raw: Raw): Product {
  const product = raw as unknown as Product
  return {
    ...product,
    categoryIds: product.categoryIds ?? [],
    variantAxes: product.variantAxes ?? [],
    specs: product.specs ?? {},
    images: product.images ?? [],
    skus: (product.skus ?? []).map((sku) => ({ ...sku, unitPriceVnd: sku.unitPriceVnd ?? null })),
  }
}

export const toAdminSummary = (raw: Raw): AdminProductSummary =>
  raw as unknown as AdminProductSummary

const isoDate = (value: string) => value.slice(0, ISO_DATE_LENGTH)

export function toPriceRow(raw: Raw): SkuPriceRow {
  const row = raw as unknown as SkuPriceRow
  return { ...row, effectiveFrom: row.effectiveFrom ? isoDate(row.effectiveFrom) : null }
}

/** GET /admin/skus/{id}/price answers { current, history } with timestamps; the history drawer wants dates. */
export function toPriceHistory(raw: Raw | PriceEntry[]): PriceEntry[] {
  const history = (
    Array.isArray(raw) ? raw : ((raw as { history?: PriceEntry[] | null }).history ?? [])
  ) as PriceEntry[]
  return history.map((entry) => ({
    unitPriceVnd: entry.unitPriceVnd,
    effectiveFrom: isoDate(entry.effectiveFrom),
    effectiveTo: entry.effectiveTo ? isoDate(entry.effectiveTo) : null,
  }))
}

/**
 * The service only accepts a start that is not in the past, as a timestamp. Today (or earlier) means "now", so
 * the field is left out; a later date starts at midnight in the business time zone (UTC+7).
 */
export function effectiveFromForApi(date: string, today: string): string | undefined {
  return date <= today ? undefined : `${date}T00:00:00+07:00`
}

export function toUploadUrl(raw: Raw): UploadUrl {
  const target = raw as unknown as UploadUrl & { key?: string }
  return {
    ...target,
    objectKey: target.objectKey ?? target.key ?? '',
    headers: target.headers ?? {},
  }
}
