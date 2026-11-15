'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createAdminProduct, listAdminProducts } from '@/catalog/admin-products-api'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { formatDate } from '@/utils/format'
import type { ProductStatus } from '@/types/catalog'
import { AdminPanel } from './admin-panel'
import { catalogFailureMessage } from './catalog-errors'
import { STATUS_LABELS } from './product-editor-shared'
import { StaffOnly } from './staff-only'

const PAGE_SIZE = 10

export function ProductsAdmin() {
  return (
    <StaffOnly role="PRODUCT_STAFF" what="manage products">
      <ProductTable />
    </StaffOnly>
  )
}

function ProductTable() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ProductStatus | ''>('')
  const [page, setPage] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<{ message: string; field?: string }>()

  const products = useQuery({
    queryKey: ['admin-products', { q, status, page }],
    queryFn: () => listAdminProducts({ q, ...(status && { status }), page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setCreateError(undefined)
    try {
      const product = await createAdminProduct(newName)
      router.push(`/admin/catalog/products/${product.id}`)
    } catch (error) {
      const field = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors?.name?.[0]
      setCreateError({ message: field ?? catalogFailureMessage(error), field })
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <button type="button" className="btn btn-primary" onClick={() => setIsCreating(true)}>
          New product
        </button>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setQ(search.trim())
            setPage(1)
          }}
          className="flex items-end gap-2"
        >
          <div className="w-56">
            <TextField
              label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-label text-ink">Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProductStatus | '')
              setPage(1)
            }}
            className="h-11 border border-rule-2 bg-paper px-3 text-ink"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isCreating && (
        <AdminPanel title="New product" onCancel={() => setIsCreating(false)}>
          <form onSubmit={create} noValidate className="mt-4 flex flex-col gap-5">
            {createError && !createError.field && <FormAlert message={createError.message} />}
            <TextField
              label="Product name"
              autoFocus
              value={newName}
              error={createError?.field}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary self-start">
              Create draft
            </button>
          </form>
        </AdminPanel>
      )}

      <div className="relative mt-8 overflow-x-auto">
        {products.isError ? (
          <FormAlert message="We could not load the products. Please reload the page." />
        ) : !products.data ? (
          <p role="status" className="text-ink-2">
            Loading products…
          </p>
        ) : products.data.items.length === 0 ? (
          <p className="text-ink-2">No products match.</p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Products</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th scope="col" className="font-label py-3 pr-4">
                  Product
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  SKUs
                </th>
                <th scope="col" className="font-label py-3">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {products.data.items.map((product) => (
                <tr key={product.id} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <Link
                      href={`/admin/catalog/products/${product.id}`}
                      className="font-label text-ink underline"
                    >
                      {product.name}
                    </Link>
                    <span className="block text-muted">{product.brand}</span>
                  </th>
                  <td className="py-3 pr-4">{STATUS_LABELS[product.status]}</td>
                  <td className="py-3 pr-4">{product.skuCount ?? '—'}</td>
                  <td className="py-3">{formatDate(product.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {products.data && products.data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((c) => c - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {products.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= products.data.pageCount}
            onClick={() => setPage((c) => c + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
