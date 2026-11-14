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
