'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { listAdminCategories } from '@/catalog/admin-api'
import { getAdminProduct } from '@/catalog/admin-products-api'
import { FormAlert } from '@/components/auth/form-alert'
import { cn } from '@/utils/tw-merge'
import { CategoriesTab, GeneralTab } from './product-general-tabs'
import { ImagesTab } from './product-images-tab'
import { productQueryKey, STATUS_LABELS, useProductSaver } from './product-editor-shared'
import { StaffOnly } from './staff-only'
import { StatusTab } from './product-status-tab'
import { VariantsTab } from './product-variants-tab'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'categories', label: 'Categories' },
  { id: 'variants', label: 'Variants' },
  { id: 'images', label: 'Images' },
  { id: 'status', label: 'Status' },
] as const
type TabId = (typeof TABS)[number]['id']

export function ProductEditor({ productId }: { productId: string }) {
  return (
    <StaffOnly role="PRODUCT_STAFF" what="edit products">
      <Editor productId={productId} />
    </StaffOnly>
  )
}

function Editor({ productId }: { productId: string }) {
  const [tab, setTab] = useState<TabId>('general')
  const saver = useProductSaver(productId)
  const product = useQuery({
    queryKey: productQueryKey(productId),
    queryFn: () => getAdminProduct(productId),
  })
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: listAdminCategories })

  if (product.isError)
    return (
      <div className="mt-6">
        <FormAlert message="We could not load this product. It may have been removed." />
      </div>
    )
  if (!product.data || !categories.data)
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading product…
      </p>
    )

  const data = product.data
  const isLocked = data.status === 'IN_REVIEW'
  const common = { product: data, saver, isLocked }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!offset) return
    const next = TABS[(index + offset + TABS.length) % TABS.length]
    select(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }
  function select(id: TabId) {
    saver.clear()
    setTab(id)
  }

  return (
    <div className="mt-6">
      <Link href="/admin/catalog/products" className="font-label text-sm underline">
        All products
      </Link>
      <h1 className="mt-2 text-3xl">{data.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {STATUS_LABELS[data.status]} · version {data.version}
      </p>
      {isLocked && (
        <p className="mt-3 max-w-[40rem] border-l-4 border-ink bg-paper-2 px-4 py-3 text-sm text-ink">
          This product is in review and cannot be edited. Send it back to draft on the Status tab to
          change it.
        </p>
      )}

      <div
        role="tablist"
        aria-label="Product sections"
        className="mt-6 flex flex-wrap gap-1 border-b border-rule"
      >
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            id={`tab-${entry.id}`}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => select(entry.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'font-label min-h-11 border-b-2 px-4 text-sm',
              tab === entry.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
        {/* key: a saved product has a new version, so each tab restarts from the stored values */}
        {tab === 'general' && <GeneralTab key={data.version} {...common} />}
        {tab === 'categories' && (
          <CategoriesTab key={data.version} {...common} categories={categories.data} />
        )}
        {tab === 'variants' && <VariantsTab key={data.version} {...common} />}
        {tab === 'images' && <ImagesTab {...common} />}
        {tab === 'status' && <StatusTab product={data} saver={saver} />}
      </div>
    </div>
  )
}
