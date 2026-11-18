'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  listPurchaseOrders,
  listReceivingInspections,
  PURCHASE_ORDERS_KEY,
  RECEIVING_INSPECTIONS_KEY,
  recordReceivingInspection,
} from '@/procurement/procurement-api'
import type { PurchaseOrder } from '@/types/procurement'
import { InventoryNav } from './inventory-nav'
import { StaffOnly } from './staff-only'

export const WAREHOUSE_OPS_ROLES = ['WAREHOUSE_MGR', 'WAREHOUSE_STAFF', 'OPS_MGR', 'ADMIN'] as const

interface LineInspectionInput {
  skuId: string
  orderedQty: number
  deliveredQty: number
  passedQty: number
  damagedQty: number
}

export function ReceivingAdmin() {
  return (
    <StaffOnly role={WAREHOUSE_OPS_ROLES} what="inspect and receive goods">
      <ReceivingAdminView />
    </StaffOnly>
  )
}

function ReceivingAdminView() {
  const queryClient = useQueryClient()
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [lineInputs, setLineInputs] = useState<LineInspectionInput[]>([])
  const [notes, setNotes] = useState<string>('')
  const [formError, setFormError] = useState<string>('')

  const { data: inspections = [], isLoading: loadingInspections } = useQuery({
    queryKey: RECEIVING_INSPECTIONS_KEY,
    queryFn: () => listReceivingInspections(),
  })

  const { data: approvedPOs = [], isLoading: loadingPOs } = useQuery({
    queryKey: PURCHASE_ORDERS_KEY,
    queryFn: () => listPurchaseOrders(),
    select: (orders) =>
      orders.filter((po) => po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED'),
  })

  const openInspectionModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setNotes(`Inbound delivery inspection for ${po.poId}`)
    setFormError('')
    setLineInputs(
      po.lines.map((l) => ({
        skuId: l.skuId,
        orderedQty: l.orderedQty,
        deliveredQty: l.orderedQty,
        passedQty: l.orderedQty,
        damagedQty: 0,
      }))
    )
  }

  const receiveMutation = useMutation({
    mutationFn: recordReceivingInspection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIVING_INSPECTIONS_KEY })
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY })
      setSelectedPO(null)
      setFormError('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to record inspection'
      setFormError(msg)
    },
  })

  const handleUpdateLine = (index: number, field: keyof LineInspectionInput, value: number) => {
    setLineInputs((prev) => {
      const next = [...prev]
      const current = { ...next[index], [field]: Math.max(0, value) }
      if (field === 'deliveredQty') {
        current.passedQty = Math.max(0, current.deliveredQty - current.damagedQty)
      } else if (field === 'passedQty') {
        current.deliveredQty = current.passedQty + current.damagedQty
      } else if (field === 'damagedQty') {
        current.passedQty = Math.max(0, current.deliveredQty - current.damagedQty)
      }
      next[index] = current
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!selectedPO) return

    for (const l of lineInputs) {
      if (l.deliveredQty !== l.passedQty + l.damagedQty) {
        setFormError(`Line ${l.skuId}: Delivered (${l.deliveredQty}) must equal Passed (${l.passedQty}) + Damaged (${l.damagedQty})`)
        return
      }
    }

    receiveMutation.mutate({
      poId: selectedPO.poId,
      notes,
      lines: lineInputs.map((l) => ({
        skuId: l.skuId,
        deliveredQty: l.deliveredQty,
        passedQty: l.passedQty,
        damagedQty: l.damagedQty,
      })),
    })
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">Inbound Receiving & QC</h1>
        <p className="text-sm text-ink-2 mt-1">
          Perform physical count and quality inspection on delivered purchase orders (Scenario SC09, Policy P01).
        </p>
      </div>

      <InventoryNav />

      {/* Ready POs section */}
      <div className="rounded-card border border-rule bg-paper p-5 space-y-4">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Approved Purchase Orders Awaiting Receipt
        </h2>
        {loadingPOs ? (
          <p className="text-sm text-ink-2">Loading purchase orders...</p>
        ) : approvedPOs.length === 0 ? (
          <p className="text-sm text-ink-2">No approved purchase orders awaiting receipt.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">PO Number</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Warehouse</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Items</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {approvedPOs.map((po) => (
                  <tr key={po.poId} className="hover:bg-paper-2">
                    <td className="px-3 py-2.5 font-medium text-ink">{po.poId}</td>
                    <td className="px-3 py-2.5 text-ink">{po.supplierName || po.supplierId}</td>
                    <td className="px-3 py-2.5 text-ink-2">{po.warehouseId}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                        {po.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">
                      {po.lines.map((l) => `${l.skuId} (x${l.orderedQty})`).join(', ')}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => openInspectionModal(po)}
                        className="rounded-button bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        Receive & Inspect (SC09)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receiving & QC Modal / Drawer */}
      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-3xl rounded-card border border-rule bg-paper p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-ink">
                  Inbound QC Inspection: {selectedPO.poId}
                </h3>
                <p className="text-xs text-ink-2">
                  Warehouse: {selectedPO.warehouseId} · Supplier: {selectedPO.supplierName || selectedPO.supplierId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPO(null)}
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

            {/* SC09 & P01 Rule Callout */}
            <div className="rounded-card border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
              <div className="font-semibold">📦 Standard SC09 Receiving Invariant</div>
              <div>
                Ordered goods never enter <span className="font-semibold">Available</span> until physically received and inspected (P01).
              </div>
              <div>
                Delivered count = Passed + Damaged. On completion:
                <code className="ml-1 rounded bg-blue-100 px-1 py-0.5">OnHand += Delivered</code>,
                <code className="ml-1 rounded bg-blue-100 px-1 py-0.5">Unsellable += Damaged</code>,
                <code className="ml-1 rounded bg-blue-100 px-1 py-0.5">Available += Passed</code>.
                Any short quantity remains unreceived.
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-rule bg-paper-2 text-ink font-semibold">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Ordered</th>
                      <th className="p-2">Delivered</th>
                      <th className="p-2">Passed (Good)</th>
                      <th className="p-2">Damaged (Unsellable)</th>
                      <th className="p-2">Short</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {lineInputs.map((line, idx) => {
                      const short = Math.max(0, line.orderedQty - line.deliveredQty)
                      const mathValid = line.deliveredQty === line.passedQty + line.damagedQty
                      return (
                        <tr key={line.skuId} className={mathValid ? '' : 'bg-red-50'}>
                          <td className="p-2 font-medium text-ink">{line.skuId}</td>
                          <td className="p-2 text-ink-2">{line.orderedQty}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={line.deliveredQty}
                              onChange={(e) => handleUpdateLine(idx, 'deliveredQty', Number(e.target.value))}
                              className="w-20 rounded border border-rule-2 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={line.passedQty}
                              onChange={(e) => handleUpdateLine(idx, 'passedQty', Number(e.target.value))}
                              className="w-20 rounded border border-rule-2 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={line.damagedQty}
                              onChange={(e) => handleUpdateLine(idx, 'damagedQty', Number(e.target.value))}
                              className="w-20 rounded border border-rule-2 px-2 py-1 text-xs text-red-600 font-medium"
                            />
                          </td>
                          <td className="p-2 font-semibold text-amber-700">
                            {short > 0 ? `${short} short` : '0'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Inspection Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded border border-rule-2 bg-paper px-3 py-1.5 text-xs text-ink"
                  placeholder="e.g. 5 damaged cartons, carrier packaging torn"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setSelectedPO(null)}
                  className="rounded-button border border-rule-2 bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receiveMutation.isPending}
                  className="rounded-button bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {receiveMutation.isPending ? 'Recording...' : 'Confirm Inbound Receipt & QC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed Inspections History */}
      <div className="rounded-card border border-rule bg-paper p-5 space-y-4">
        <h2 className="font-heading text-lg font-semibold text-ink">Recent Receiving Inspections</h2>
        {loadingInspections ? (
          <p className="text-sm text-ink-2">Loading inspection history...</p>
        ) : inspections.length === 0 ? (
          <p className="text-sm text-ink-2">No receiving inspections recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Inspection ID</th>
                  <th className="px-3 py-2.5">PO Number</th>
                  <th className="px-3 py-2.5">Warehouse</th>
                  <th className="px-3 py-2.5">Inspector</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Lines Summary</th>
                  <th className="px-3 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {inspections.map((insp) => (
                  <tr key={insp.inspectionId} className="hover:bg-paper-2">
                    <td className="px-3 py-2.5 font-medium text-ink">{insp.inspectionId}</td>
                    <td className="px-3 py-2.5 text-ink">{insp.poId}</td>
                    <td className="px-3 py-2.5 text-ink-2">{insp.warehouseId}</td>
                    <td className="px-3 py-2.5 text-ink-2">{insp.inspectorId}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                        {insp.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-2">
                      {insp.lines.map((l) => (
                        <div key={l.skuId}>
                          {l.skuId}: {l.passedQty} passed, {l.damagedQty} damaged, {l.shortQty} short
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2 text-xs">
                      {new Date(insp.createdAt).toLocaleString()}
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
