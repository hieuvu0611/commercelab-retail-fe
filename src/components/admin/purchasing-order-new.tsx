'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { WAREHOUSES } from '@/configs/roles'
import { createPurchaseOrder, listSuppliers, PURCHASE_ORDERS_KEY, SUPPLIERS_KEY } from '@/procurement/procurement-api'
import type { PurchaseOrderLine } from '@/types/procurement'
import { StaffOnly } from './staff-only'
import { PROCUREMENT_ROLES } from './purchasing-orders-admin'

const SAMPLE_SKUS = [
  { id: 'SKU-BACKPACK-BLK', name: 'Everest Outdoor Backpack 20L - Black', defaultCost: 150_000 },
  { id: 'SKU-BACKPACK-BLU', name: 'Everest Outdoor Backpack 20L - Navy Blue', defaultCost: 150_000 },
  { id: 'SKU-BOTTLE-BLUE-500ML', name: 'Hydro Flask Vacuum Bottle 500ml - Blue', defaultCost: 100_000 },
  { id: 'SKU-BOTTLE-RED-500ML', name: 'Hydro Flask Vacuum Bottle 500ml - Red', defaultCost: 100_000 },
]

export function PurchasingOrderNew() {
  return (
    <StaffOnly role={PROCUREMENT_ROLES} what="create purchase orders">
      <PurchasingOrderForm />
    </StaffOnly>
  )
}

function PurchasingOrderForm() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: listSuppliers,
  })

  const [supplierId, setSupplierId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>('WH-HCM-01')
  const [notes, setNotes] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const [lines, setLines] = useState<PurchaseOrderLine[]>([
    { skuId: 'SKU-BACKPACK-BLK', orderedQty: 100, unitCostVnd: 150_000 },
  ])

  const totalAmountVnd = lines.reduce((sum, l) => sum + (l.orderedQty || 0) * (l.unitCostVnd || 0), 0)

  const handleLineChange = (index: number, field: keyof PurchaseOrderLine, value: unknown) => {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleAddLine = () => {
    setLines((prev) => [...prev, { skuId: 'SKU-BOTTLE-BLUE-500ML', orderedQty: 50, unitCostVnd: 100_000 }])
  }

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const mutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
      router.push(`/admin/purchasing/orders/${data.poId}`)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to create purchase order'
      setErrorMsg(message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    const effectiveSupplierId = supplierId || (suppliers[0]?.supplierId ?? '')
    if (!effectiveSupplierId) {
      setErrorMsg('Please select a supplier')
      return
    }
    mutation.mutate({
      supplierId: effectiveSupplierId,
      warehouseId,
      notes,
      lines,
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between border-b border-rule pb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">New Purchase Order</h1>
          <p className="text-sm text-ink-2">Create a supplier purchase order (PR/PO threshold check P10 applies)</p>
        </div>
        <Link
          href="/admin/purchasing"
          className="rounded-button border border-rule-2 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-2"
        >
          Back to Orders
        </Link>
      </div>

      {errorMsg && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 rounded-card border border-rule bg-paper p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="po-supplier" className="font-label block text-sm font-medium text-ink">
              Supplier *
            </label>
            <select
              id="po-supplier"
              value={supplierId || (suppliers[0]?.supplierId ?? '')}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-1 block h-10 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
              disabled={loadingSuppliers}
            >
              {suppliers.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="po-warehouse" className="font-label block text-sm font-medium text-ink">
              Destination Warehouse *
            </label>
            <select
              id="po-warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="mt-1 block h-10 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
            >
              {WAREHOUSES.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="po-notes" className="font-label block text-sm font-medium text-ink">
              Notes & Justification
            </label>
            <textarea
              id="po-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Replenishment for seasonal demand"
              className="mt-1 block w-full rounded-control border border-rule-2 bg-paper p-3 text-sm text-ink"
            />
          </div>
        </div>

        {/* Lines */}
        <div className="rounded-card border border-rule bg-paper p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-ink">Order Items</h2>
            <button
              type="button"
              onClick={handleAddLine}
              className="rounded-button border border-rule-2 bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-paper-2"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-3 border-b border-rule-2 pb-3">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor={`sku-${idx}`} className="block text-xs font-medium text-ink-2">
                    SKU / Product
                  </label>
                  <select
                    id={`sku-${idx}`}
                    value={line.skuId}
                    onChange={(e) => {
                      const selected = SAMPLE_SKUS.find((s) => s.id === e.target.value)
                      handleLineChange(idx, 'skuId', e.target.value)
                      if (selected) {
                        handleLineChange(idx, 'unitCostVnd', selected.defaultCost)
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-control border border-rule-2 bg-paper px-2 text-sm text-ink"
                  >
                    {SAMPLE_SKUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-28">
                  <label htmlFor={`qty-${idx}`} className="block text-xs font-medium text-ink-2">
                    Quantity
                  </label>
                  <input
                    id={`qty-${idx}`}
                    type="number"
                    min={1}
                    value={line.orderedQty}
                    onChange={(e) => handleLineChange(idx, 'orderedQty', parseInt(e.target.value, 10) || 0)}
                    className="mt-1 h-9 w-full rounded-control border border-rule-2 bg-paper px-2 text-sm text-ink text-right"
                  />
                </div>

                <div className="w-36">
                  <label htmlFor={`cost-${idx}`} className="block text-xs font-medium text-ink-2">
                    Unit Cost (VND)
                  </label>
                  <input
                    id={`cost-${idx}`}
                    type="number"
                    min={0}
                    step={1000}
                    value={line.unitCostVnd}
                    onChange={(e) => handleLineChange(idx, 'unitCostVnd', parseInt(e.target.value, 10) || 0)}
                    className="mt-1 h-9 w-full rounded-control border border-rule-2 bg-paper px-2 text-sm text-ink text-right"
                  />
                </div>

                <div className="w-36 text-right">
                  <span className="block text-xs font-medium text-ink-2">Line Total</span>
                  <span className="mt-2 block text-sm font-semibold text-ink">
                    {formatVnd((line.orderedQty || 0) * (line.unitCostVnd || 0))}
                  </span>
                </div>

                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    className="mt-4 text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Total summary */}
          <div className="mt-4 flex items-center justify-between border-t border-rule pt-4">
            <span className="text-base font-semibold text-ink">Total PO Amount:</span>
            <span className="font-heading text-xl font-bold text-accent">{formatVnd(totalAmountVnd)}</span>
          </div>

          {/* Threshold alert */}
          <div className="mt-4 rounded border border-rule-2 bg-paper-2 p-3 text-xs text-ink-2">
            {totalAmountVnd <= 20_000_000 ? (
              <span className="text-blue-700 font-medium">
                ℹ️ Standard Purchase Order (≤ 20,000,000 VND): Requires Procurement Manager approval.
              </span>
            ) : (
              <span className="text-amber-700 font-medium">
                ⚠️ High-Value Purchase Order (&gt; 20,000,000 VND): Requires Operations Director or Finance Manager approval.
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/admin/purchasing"
            className="rounded-button border border-rule-2 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-button bg-accent px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Submitting...' : 'Submit Purchase Order'}
          </button>
        </div>
      </form>
    </div>
  )
}
