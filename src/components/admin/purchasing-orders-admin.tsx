'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { WAREHOUSES } from '@/configs/roles'
import { listPurchaseOrders, PURCHASE_ORDERS_KEY } from '@/procurement/procurement-api'
import type { POStatus, PurchaseOrder } from '@/types/procurement'
import { StaffOnly } from './staff-only'

export const PROCUREMENT_ROLES = [
  'PROCUREMENT_MGR',
  'WAREHOUSE_MGR',
  'WAREHOUSE_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_MGR',
  'ADMIN',
] as const

const STATUS_LABELS: Record<POStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-paper-3 text-ink-2' },
  PENDING_APPROVAL: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', color: 'bg-blue-100 text-blue-800' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  ORDERED: { label: 'Ordered', color: 'bg-purple-100 text-purple-800' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', color: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700' },
}

export function PurchasingOrdersAdmin() {
  return (
    <StaffOnly role={PROCUREMENT_ROLES} what="view and manage procurement orders">
      <PurchasingOrdersList />
    </StaffOnly>
  )
}

function PurchasingOrdersList() {
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [status, setStatus] = useState<string>('')

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, { warehouseId, status }],
    queryFn: () => listPurchaseOrders({ warehouseId: warehouseId || undefined, status: status || undefined }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Purchase Orders</h1>
          <p className="text-sm text-ink-2">Manage supplier purchase orders and approvals (SC09, P10)</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/purchasing/suppliers"
            className="rounded-button border border-rule-2 bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-2"
          >
            Suppliers
          </Link>
          <Link
            href="/admin/purchasing/orders/new"
            className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            + Create Purchase Order
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-card bg-paper-2 p-4">
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
          <label htmlFor="filter-status" className="font-label text-sm text-ink">
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
          >
            <option value="">All Statuses</option>
            {Object.keys(STATUS_LABELS).map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st as POStatus].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted">Loading purchase orders...</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-600">Failed to load purchase orders</div>
      ) : orders.length === 0 ? (
        <div className="rounded-card border border-dashed border-rule-2 p-12 text-center text-sm text-muted">
          No purchase orders found matching filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-rule bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
              <tr>
                <th className="px-4 py-3">PO Number</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {orders.map((po: PurchaseOrder) => {
                const badge = STATUS_LABELS[po.status] || { label: po.status, color: 'bg-gray-100 text-gray-800' }
                return (
                  <tr key={po.poId} className="hover:bg-paper-2 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/admin/purchasing/orders/${po.poId}`} className="text-accent hover:underline">
                        {po.poId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{po.supplierName || po.supplierId}</td>
                    <td className="px-4 py-3 text-ink-2">{po.warehouseId}</td>
                    <td className="px-4 py-3 font-medium text-ink">{formatVnd(po.totalAmountVnd)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{po.createdBy}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/purchasing/orders/${po.poId}`}
                        className="rounded border border-rule-2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper-3"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
