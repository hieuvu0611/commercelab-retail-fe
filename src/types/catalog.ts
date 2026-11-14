// Catalogue API types (Phase 2). Everything the screens know about the catalogue contract lives here so it
// can be reconciled against the real services in one place (P2-T17).

/** Node of the public category tree: GET /categories and GET /categories/{path...}. */
export interface CategoryNode {
  id: string
  parentId: string | null
  name: string
  slug: string
  /** Materialized path without a leading slash, for example "backpacks/city". */
  path: string
  /** 1 for a top-level category, at most 3. */
  depth: number
  sortOrder: number
  isActive: boolean
  children: CategoryNode[]
}

export interface BreadcrumbEntry {
  label: string
  /** Absent for the current page. */
  href?: string
}

export type ProductStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'UNPUBLISHED'

export interface ProductImage {
  id: string
  url: string
  alt?: string
}

/** A sellable variant. `attributes` has one value for every variant axis of the product. */
export interface Sku {
  skuId: string
  attributes: Record<string, string>
  isActive: boolean
  /** Current unit price in integer VND, excluding VAT; null when no price is set. */
  unitPriceVnd: number | null
}

/** The product as the backoffice sees it: GET /admin/products/{id}. */
export interface Product {
  id: string
  slug: string
  name: string
  description: string
  brand: string
  primaryCategoryId: string | null
  categoryIds: string[]
  variantAxes: string[]
  specs: Record<string, string>
  images: ProductImage[]
  status: ProductStatus
  version: number
  skus: Sku[]
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

/** Card data of GET /products (storefront list). Prices exclude VAT. */
export interface ProductListItem {
  id: string
  slug: string
  name: string
  brand: string
  imageUrl: string | null
  minPriceVnd: number
  maxPriceVnd: number
  /** Distinct values per variant axis, for example { color: ["Black", "Navy"] }. */
  attributes: Record<string, string[]>
}

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

/** Query of GET /products. Attribute filters are sent as `attr.<axis>=<value>[,<value>]`. */
export interface ProductListParams {
  category?: string
  q?: string
  minPrice?: number
  maxPrice?: number
  attrs?: Record<string, string[]>
  sort?: ProductSort
  page?: number
  limit?: number
}

/** Variant the customer picked: one value per axis. */
export type VariantSelection = Record<string, string>

export interface StorefrontSku {
  skuId: string
  attributes: Record<string, string>
  /** Unit price in integer VND, excluding VAT. */
  unitPriceVnd: number
  isActive: boolean
}

/** GET /products/{slug}. `availability` stays "unknown" until stock arrives in Phase 3. */
export interface ProductDetail {
  id: string
  slug: string
  name: string
  description: string
  brand: string
  categoryPath: string | null
  variantAxes: string[]
  specs: Record<string, string>
  images: ProductImage[]
  skus: StorefrontSku[]
  availability: 'unknown'
}
