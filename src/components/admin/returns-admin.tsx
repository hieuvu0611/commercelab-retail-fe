'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { WAREHOUSES } from '@/configs/roles'
import { listBackofficeReturns, STAFF_RETURNS_KEY } from '@/returns/backoffice-returns-api'
import { returnReasonLabel, returnStatusLabel } from '@/returns/return-state'
import { RETURN_STATUSES, type ReturnReasonCode, type ReturnStatus } from '@/types/returns'
import { StaffOnly } from './staff-only'

export const RETURN_STAFF_ROLES = [
  'SUPPORT_AGENT',
  'SUPPORT_LEAD',
  'SUPPORT_STAFF',
  'WAREHOUSE_STAFF',
  'WAREHOUSE_MGR',
  'FINANCE',
  'FINANCE_STAFF',
  'FINANCE_MGR',
  'OPS_MGR',
  'ADMIN',
] as const

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function ReturnsAdmin() {
  return (
    <StaffOnly role={RETURN_STAFF_ROLES} what="view and manage returns">
      <ReturnsList />
    </StaffOnly>
  )
}

function ReturnsList() {
  const [status, setStatus] = useState<ReturnStatus | ''>('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [orderId, setOrderId] = useState<string>('')

  const returns = useQuery({
    queryKey: [...STAFF_RETURNS_KEY, { status, warehouseId, orderId }],
    queryFn: () => listBackofficeReturns({ status, warehouseId, orderId }),
  })

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-card bg-paper-2 p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-status" className="font-label text-sm text-ink">
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReturnStatus | '')}
            className="h-10 rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
          >
            <option value="">All Statuses</option>
            {RETURN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {returnStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-warehouse" className="font-label text-sm text-ink">
            Warehouse
          </label>
          <select
            id="filter-warehouse"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="h-10 rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
          >
            <option value="">All Warehouses</option>
            {WAREHOUSES.map((wh) => (
              <option key={wh} value={wh}>
                {wh}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-order" className="font-label text-sm text-ink">
            Order ID
          </label>
          <input
            type="text"
            id="filter-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g. O-001"
            className="h-10 rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="relative mt-6 overflow-x-auto">
        {returns.isError ? (
          <FormAlert message="Failed to load returns list. Please reload the page." />
        ) : returns.isLoading || !returns.data ? (
          <p role="status" className="text-ink-2">
            Loading returns…
          </p>
        ) : returns.data.items.length === 0 ? (
          <p className="mt-4 text-ink-2">No return requests match the criteria.</p>
        ) : (
          <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th className="py-3 pr-4 font-label">RMA ID</th>
                <th className="py-3 pr-4 font-label">Order</th>
                <th className="py-3 pr-4 font-label">Warehouse</th>
                <th className="py-3 pr-4 font-label">Reason</th>
                <th className="py-3 pr-4 font-label">Items</th>
                <th className="py-3 pr-4 font-label">Status</th>
                <th className="py-3 pr-4 font-label">Refund</th>
                <th className="py-3 font-label">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {returns.data.items.map((rma) => {
                const totalQty = rma.lines.reduce((s, l) => s + l.quantity, 0)
                return (
                  <tr key={rma.returnId} className="hover:bg-paper-2">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/returns/${encodeURIComponent(rma.returnId)}`}
                        className="font-label text-accent underline"
                      >
                        {rma.returnId}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/orders/${encodeURIComponent(rma.orderId)}`}
                        className="text-ink hover:underline"
                      >
                        {rma.orderId}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-muted">{rma.warehouseId}</td>
                    <td className="py-3 pr-4">
                      <span className="font-label text-ink">{returnReasonLabel(rma.reason as ReturnReasonCode)}</span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {totalQty} item{totalQty > 1 ? 's' : ''}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink border border-rule">
                        {returnStatusLabel(rma.status)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {rma.refund ? formatVnd(rma.refund.amountVnd) : '—'}
                    </td>
                    <td className="py-3 text-muted">
                      {dateFormat.format(new Date(rma.createdAt))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
