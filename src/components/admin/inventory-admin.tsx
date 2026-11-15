'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { listInventory } from '@/inventory/admin-inventory-api'
import { warehousesInScope } from '@/inventory/scope'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import type { InventoryRow } from '@/types/inventory'
import { MovementsPanel, OpeningStockPanel } from './inventory-panels'
import { StaffOnly } from './staff-only'

const PAGE_SIZE = 15
const QUERY_KEY = ['admin-inventory']
const WAREHOUSE_ROLES = ['WAREHOUSE_MGR', 'WAREHOUSE_STAFF'] as const
const MANAGER_ROLE = 'WAREHOUSE_MGR'

type Panel = { kind: 'opening' } | { kind: 'history'; row: InventoryRow }

export function InventoryAdmin() {
  return (
    <StaffOnly role={WAREHOUSE_ROLES} what="manage inventory">
      <InventoryList />
    </StaffOnly>
  )
}

const HEADINGS = ['SKU', 'Warehouse', 'On hand', 'Unsellable', 'Reserved', 'Committed', 'Available']
const NUMBER_FIELDS = ['onHand', 'unsellable', 'reserved', 'committed', 'available'] as const

function InventoryList() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const warehouses = warehousesInScope(session?.user?.warehouseScopes ?? [])
  const isManager = session?.user?.roles.includes(MANAGER_ROLE) ?? false
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [warehouse, setWarehouse] = useState<string>()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string>()
  const inventory = useQuery({
    queryKey: [...QUERY_KEY, { warehouse, warehouses, q, page }],
    queryFn: () => listInventory({ warehouse, warehouses, q, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setQ(search.trim())
            setPage(1)
          }}
          className="flex items-end gap-2"
        >
          <div className="w-52 sm:w-64">
            <TextField
              label="Search SKUs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
        {warehouses.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inventory-warehouse" className="font-label text-sm text-ink">
              Warehouse
            </label>
            <select
              id="inventory-warehouse"
              value={warehouse ?? ''}
              onChange={(event) => {
                setWarehouse(event.target.value || undefined)
                setPage(1)
              }}
              className="h-11 border border-rule-2 bg-paper px-3 text-ink"
            >
              <option value="">All warehouses</option>
              {warehouses.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        ) : (
          warehouses.length === 1 && (
            <p className="pb-3 text-sm text-ink-2">Showing warehouse {warehouses[0]}</p>
          )
        )}
        {isManager && (
          <button
            type="button"
            onClick={() => {
              setNotice(undefined)
              setPanel({ kind: 'opening' })
            }}
            className="btn btn-primary"
          >
            Add opening stock
          </button>
        )}
      </div>
      {!isManager && (
        <p className="mt-3 text-sm text-muted">Only warehouse managers can record opening stock.</p>
      )}

      {notice && (
        <p
          role="status"
          className="mt-4 max-w-[40rem] border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      {panel?.kind === 'opening' && (
        <OpeningStockPanel
          warehouses={warehouses}
          onCancel={() => setPanel(null)}
          onDone={(message) => {
            setNotice(message)
            setPanel(null)
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
            void queryClient.invalidateQueries({ queryKey: ['admin-inventory-movements'] })
          }}
        />
      )}
      {panel?.kind === 'history' && (
        <MovementsPanel
          key={`${panel.row.skuId}|${panel.row.warehouseId}`}
          skuId={panel.row.skuId}
          warehouseId={panel.row.warehouseId}
          onCancel={() => setPanel(null)}
        />
      )}

      <div className="relative mt-8 overflow-x-auto">
        {inventory.isError ? (
          <FormAlert message="We could not load the inventory. Please reload the page." />
        ) : !inventory.data ? (
          <p role="status" className="text-ink-2">
            Loading inventory…
          </p>
        ) : inventory.data.items.length === 0 ? (
          <p className="text-ink-2">No SKUs match.</p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Stock per SKU and warehouse</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {HEADINGS.map((heading) => (
                  <th key={heading} scope="col" className="font-label py-3 pr-4">
                    {heading}
                  </th>
                ))}
                <th scope="col" className="py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {inventory.data.items.map((row) => (
                <tr
                  key={`${row.warehouseId}|${row.skuId}`}
                  className="border-b border-rule align-top"
                >
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    {row.skuId}
                  </th>
                  <td className="py-3 pr-4">{row.warehouseId}</td>
                  {NUMBER_FIELDS.map((field) => (
                    <td
                      key={field}
                      className={`py-3 pr-4 tabular-nums ${field === 'available' ? 'font-label text-ink' : ''}`}
                    >
                      {row[field]}
                    </td>
                  ))}
                  <td className="py-3">
                    <button
                      type="button"
                      aria-label={`History of ${row.skuId} in ${row.warehouseId}`}
                      onClick={() => {
                        setNotice(undefined)
                        setPanel({ kind: 'history', row })
                      }}
                      className="font-label min-h-11 underline"
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {inventory.data && inventory.data.pageCount > 1 && (
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
            Page {page} of {inventory.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= inventory.data.pageCount}
            onClick={() => setPage((c) => c + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
