// Shell navigation. Paths named in the phase plans are used as-is
// (/login, /register, /account, /search, /c/..., /admin/catalog/*, /admin/users).
// The remaining backoffice paths are provisional until their phases are refined.

import type { MessageKey } from '@/i18n/dictionaries/en'

export interface NavLink {
  label: string
  labelKey?: MessageKey
  href: string
}

export interface NavGroup {
  label: string
  labelKey?: MessageKey
  links: NavLink[]
}

export const STOREFRONT_ROUTES = {
  home: '/',
  search: '/search',
  cart: '/cart',
  checkout: '/checkout',
  login: '/login',
  register: '/register',
  account: '/account',
  staffLogin: '/admin/login',
} as const

// Top-level departments from docs/00 (backpacks, water bottles, accessories).
// Fallback when the live category tree (P2-T10) cannot be loaded.
export const STOREFRONT_CATEGORIES: NavLink[] = [
  { label: 'Backpacks', labelKey: 'category.backpacks', href: '/c/backpacks' },
  { label: 'Bottles', labelKey: 'category.bottles', href: '/c/bottles' },
  {
    label: 'Travel accessories',
    labelKey: 'category.travelAccessories',
    href: '/c/travel-accessories',
  },
]

export const ADMIN_HOME = '/admin'

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Sales',
    labelKey: 'admin.nav.group.sales',
    links: [
      { label: 'Overview', labelKey: 'admin.nav.link.overview', href: ADMIN_HOME },
      { label: 'OLAP Analytics', labelKey: 'admin.nav.link.olapAnalytics', href: '/admin/analytics' },
      { label: 'Orders', labelKey: 'admin.nav.link.orders', href: '/admin/orders' },
      { label: 'Returns', labelKey: 'admin.nav.link.returns', href: '/admin/returns' },
      { label: 'Exception cases', labelKey: 'admin.nav.link.exceptionCases', href: '/admin/cases' },
    ],
  },
  {
    label: 'Catalogue',
    labelKey: 'admin.nav.group.catalogue',
    links: [
      { label: 'Products', labelKey: 'admin.nav.link.products', href: '/admin/catalog/products' },
      {
        label: 'Categories',
        labelKey: 'admin.nav.link.categories',
        href: '/admin/catalog/categories',
      },
      { label: 'Prices', labelKey: 'admin.nav.link.prices', href: '/admin/catalog/prices' },
    ],
  },
  {
    label: 'Marketing',
    labelKey: 'admin.nav.group.marketing',
    links: [
      { label: 'Vouchers', labelKey: 'admin.nav.link.vouchers', href: '/admin/marketing/vouchers' },
      {
        label: 'Campaigns',
        labelKey: 'admin.nav.link.campaigns',
        href: '/admin/marketing/campaigns',
      },
    ],
  },
  {
    label: 'Warehouse',
    labelKey: 'admin.nav.group.warehouse',
    links: [
      { label: 'Inventory', labelKey: 'admin.nav.link.inventory', href: '/admin/inventory' },
      { label: 'Purchasing', labelKey: 'admin.nav.link.purchasing', href: '/admin/purchasing' },
      { label: 'Shipments', labelKey: 'admin.nav.link.shipments', href: '/admin/shipments' },
    ],
  },
  {
    label: 'Finance',
    labelKey: 'admin.nav.group.finance',
    links: [
      { label: 'Ledger', labelKey: 'admin.nav.link.ledger', href: '/admin/ledger' },
      { label: 'Approvals', labelKey: 'admin.nav.link.approvals', href: '/admin/approvals' },
    ],
  },
  {
    label: 'Settings',
    labelKey: 'admin.nav.group.settings',
    links: [{ label: 'Staff users', labelKey: 'admin.nav.link.staffUsers', href: '/admin/users' }],
  },
]

export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === ADMIN_HOME || href === STOREFRONT_ROUTES.home) {
    return pathname === href
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
