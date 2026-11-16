'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  createSupplierReturn,
  dispatchSupplierReturn,
  listSupplierReturns,
  listSuppliers,
  SUPPLIER_RETURNS_KEY,
  SUPPLIERS_KEY,
} from '@/procurement/procurement-api'
import type { SupplierReturn } from '@/types/procurement'
import { WAREHOUSES } from '@/configs/roles'
import { InventoryNav } from './inventory-nav'
import { StaffOnly } from './staff-only'
import { WAREHOUSE_OPS_ROLES } from './receiving-admin'

export function SupplierReturnsAdmin() {
  return (
    <StaffOnly role={WAREHOUSE_OPS_ROLES} what="manage supplier returns">
      <SupplierReturnsAdminView />
    </StaffOnly>
  )
}

function SupplierReturnsAdminView() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [dispatchReturnItem, setDispatchReturnItem] = useState<SupplierReturn | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0] || 'WH-HCM-01')
  const [skuId, setSkuId] = useState('SKU-BACKPACK-BLK')
  const [quantity, setQuantity] = useState(5)
  const [reason, setReason] = useState('Damaged on delivery (SC09 inbound QC reject)')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const { data: returns = [], isLoading: loadingReturns } = useQuery({
    queryKey: SUPPLIER_RETURNS_KEY,
    queryFn: () => listSupplierReturns(),
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: listSuppliers,
  })

  const createMutation = useMutation({
    mutationFn: createSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIER_RETURNS_KEY })
      setShowCreateModal(false)
      setFormError('')
      setNotes('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create return record'
      setFormError(msg)
    },
  })

  const dispatchMutation = useMutation({
    mutationFn: ({ returnId, tracking }: { returnId: string; tracking?: string }) =>
      dispatchSupplierReturn(returnId, tracking),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIER_RETURNS_KEY })
      setDispatchReturnItem(null)
      setTrackingNumber('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch return'
      setFormError(msg)
    },
  })

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!supplierId) {
      setFormError('Please select a supplier')
      return
    }
    if (!skuId.trim() || quantity <= 0) {
      setFormError('Valid SKU and quantity > 0 are required')
      return
    }

    createMutation.mutate({
      supplierId,
      warehouseId,
      notes,
      lines: [
        {
          skuId: skuId.trim(),
          quantity,
          reason,
        },
      ],
    })
  }

  const handleConfirmDispatch = () => {
    if (!dispatchReturnItem) return
    dispatchMutation.mutate({
      returnId: dispatchReturnItem.returnId,
      tracking: trackingNumber.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">Supplier Returns (RTV)</h1>
          <p className="text-sm text-ink-2 mt-1">
            Manage returns to vendor for damaged and unsellable inventory.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true)
            if (suppliers.length > 0 && !supplierId) {
              setSupplierId(suppliers[0].supplierId)
            }
          }}
          className="rounded-button bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Create Supplier Return
        </button>
      </div>

      <InventoryNav />

      {/* Return to vendor policy alert */}
      <div className="rounded-card border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
        <div className="font-semibold">📦 Return to Vendor (RTV) Accounting Invariant</div>
        <div>
          Returning unsellable damaged goods reduces <code className="rounded bg-blue-100 px-1 py-0.5">OnHand -= qty</code> and <code className="rounded bg-blue-100 px-1 py-0.5">Unsellable -= qty</code>.
          Customer-facing <code className="rounded bg-blue-100 px-1 py-0.5">Available</code> remains strictly unaffected.
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-rule bg-paper p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <h3 className="font-heading text-lg font-bold text-ink">New Supplier Return Dossier</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-ink-2 hover:text-ink text-sm font-semibold"
              >
                ✕ Close
              </button>
            </div>

            {formError && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Target Supplier</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                  required
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Warehouse</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                >
                  {WAREHOUSES.map((wh) => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">SKU</label>
                  <input
                    type="text"
                    value={skuId}
                    onChange={(e) => setSkuId(e.target.value)}
                    className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink font-mono"
                    placeholder="SKU-BACKPACK-BLK"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Return Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Return Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                  placeholder="Defective stitching, zipper jammed"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
                  placeholder="Reference original PO / Inbound QC inspection"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-button border border-rule-2 bg-paper px-4 py-2 font-medium text-ink hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-button bg-accent px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Create Return Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatchReturnItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-xl space-y-4 text-xs">
            <h3 className="font-heading text-lg font-bold text-ink">
              Dispatch Return: {dispatchReturnItem.returnId}
            </h3>
            <p className="text-ink-2">
              Confirm physical dispatch to {dispatchReturnItem.supplierName || dispatchReturnItem.supplierId}.
              This deducts {dispatchReturnItem.lines.reduce((s, l) => s + l.quantity, 0)} units from Unsellable stock.
            </p>

            <div>
              <label className="block font-semibold text-ink mb-1">Carrier Tracking Number (Optional)</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="VNPOST-RTV-987654"
                className="w-full rounded border border-rule-2 bg-paper px-3 py-2 text-ink"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-rule">
              <button
                type="button"
                onClick={() => setDispatchReturnItem(null)}
                className="rounded-button border border-rule-2 bg-paper px-4 py-2 font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={dispatchMutation.isPending}
                className="rounded-button bg-accent px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {dispatchMutation.isPending ? 'Dispatching...' : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Returns List */}
      <div className="rounded-card border border-rule bg-paper p-5 space-y-4">
        <h2 className="font-heading text-lg font-semibold text-ink">Supplier Return Dossiers</h2>
        {loadingReturns ? (
          <p className="text-sm text-ink-2">Loading supplier returns...</p>
        ) : returns.length === 0 ? (
          <p className="text-sm text-ink-2">No supplier returns created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Return ID</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Warehouse</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Returned SKUs</th>
                  <th className="px-3 py-2.5">Tracking #</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {returns.map((ret) => (
                  <tr key={ret.returnId} className="hover:bg-paper-2">
                    <td className="px-3 py-2.5 font-medium text-ink">{ret.returnId}</td>
                    <td className="px-3 py-2.5 text-ink">{ret.supplierName || ret.supplierId}</td>
                    <td className="px-3 py-2.5 text-ink-2">{ret.warehouseId}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ret.status === 'DISPATCHED'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ret.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-2">
                      {ret.lines.map((l) => (
                        <div key={l.skuId}>
                          {l.skuId} (x{l.quantity}) - {l.reason}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink font-mono">
                      {ret.trackingNumber || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {ret.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => setDispatchReturnItem(ret)}
                          className="rounded border border-rule-2 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-paper-3"
                        >
                          Dispatch Return
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
