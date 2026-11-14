// Shell navigation. Paths named in the phase plans are used as-is
// (/login, /register, /account, /search, /c/..., /admin/catalog/*, /admin/users).
// The remaining backoffice paths are provisional until their phases are refined.

export interface NavLink {
  label: string
  href: string
}

export interface NavGroup {
  label: string
  links: NavLink[]
}

export const STOREFRONT_ROUTES = {
  home: '/',
  search: '/search',
  cart: '/cart',
  login: '/login',
  register: '/register',
  account: '/account',
  staffLogin: '/admin/login',
} as const

// Top-level departments from docs/00 (backpacks, water bottles, accessories).
// Replaced by the live category tree in Phase 2.
export const STOREFRONT_CATEGORIES: NavLink[] = [
  { label: 'Backpacks', href: '/c/backpacks' },
  { label: 'Bottles', href: '/c/bottles' },
  { label: 'Accessories', href: '/c/accessories' },
]

export const ADMIN_HOME = '/admin'

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Sales',
    links: [
      { label: 'Overview', href: ADMIN_HOME },
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Returns', href: '/admin/returns' },
    ],
  },
  {
    label: 'Catalogue',
    links: [
      { label: 'Products', href: '/admin/catalog/products' },
      { label: 'Categories', href: '/admin/catalog/categories' },
      { label: 'Prices', href: '/admin/catalog/prices' },
    ],
  },
  {
    label: 'Warehouse',
    links: [
      { label: 'Inventory', href: '/admin/inventory' },
      { label: 'Purchasing', href: '/admin/purchasing' },
      { label: 'Shipments', href: '/admin/shipments' },
    ],
  },
  {
    label: 'Finance',
    links: [
      { label: 'Ledger', href: '/admin/ledger' },
      { label: 'Approvals', href: '/admin/approvals' },
    ],
  },
  {
    label: 'Settings',
    links: [{ label: 'Staff users', href: '/admin/users' }],
  },
]

export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === ADMIN_HOME || href === STOREFRONT_ROUTES.home) {
    return pathname === href
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
