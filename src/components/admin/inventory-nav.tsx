'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavTab {
  label: string
  href: string
}

const TABS: NavTab[] = [
  { label: 'Stock Balances', href: '/admin/inventory' },
  { label: 'Inbound QC & Receiving', href: '/admin/inventory/receiving' },
  { label: 'Supplier Returns', href: '/admin/inventory/supplier-returns' },
  { label: 'Stocktakes', href: '/admin/inventory/stocktakes' },
  { label: 'Stock Adjustments', href: '/admin/inventory/adjustments' },
]

export function InventoryNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-rule pb-2 mb-6">
      <nav className="flex flex-wrap gap-2" aria-label="Inventory Sections">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-button px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
