'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useState } from 'react'
import {
  createTransfer,
  dispatchTransfer,
  listTransfers,
  receiveTransfer,
  TRANSFERS_KEY,
  type TransferReceiveLine,
  type WarehouseTransfer,
} from '@/inventory/transfers-api'
import { warehousesInScope } from '@/inventory/scope'
import { WAREHOUSES } from '@/configs/roles'
import { ApiError } from '@/services/api/api-error'
import { FormAlert } from '@/components/auth/form-alert'
import { StaffOnly } from './staff-only'

const WAREHOUSE_ROLES = ['WAREHOUSE_MGR', 'WAREHOUSE_STAFF'] as const

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-paper-2 text-ink-2',
  IN_TRANSIT: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800',
  RECEIVED_WITH_DISCREPANCY: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-paper-2 text-muted',
}

export function TransfersAdmin() {
  return (
    <StaffOnly role={WAREHOUSE_ROLES} what="manage inter-warehouse transfers">
      <TransfersPanel />
    </StaffOnly>
  )
}

function TransfersPanel() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const scopedWarehouses = warehousesInScope(session?.user?.warehouseScopes ?? [])
  const hasAll = (session?.user?.warehouseScopes ?? []).includes('ALL')
  const [fromWh, setFromWh] = useState(scopedWarehouses[0] || WAREHOUSES[0])
  const [toWh, setToWh] = useState(
    WAREHOUSES.find((w) => w !== (scopedWarehouses[0] || WAREHOUSES[0])) || WAREHOUSES[1]
  )
  const [skuId, setSkuId] = useState('SKU-BALO-BLACK-20L')
  const [quantity, setQuantity] = useState('4')
  const [notes, setNotes] = useState('Stock rebalancing between HCM and HN')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [receiving, setReceiving] = useState<WarehouseTransfer | null>(null)
  const [receiveLines, setReceiveLines] = useState<Record<string, TransferReceiveLine>>({})

  const transfersQuery = useQuery({
    queryKey: TRANSFERS_KEY,
    queryFn: () => listTransfers(),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: TRANSFERS_KEY })

  const createMut = useMutation({
    mutationFn: () =>
      createTransfer({
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        notes: notes.trim() || undefined,
        items: [{ skuId: skuId.trim(), quantity: Math.max(1, Number(quantity) || 0) }],
      }),
    onSuccess: (created) => {
      setErrorMsg(null)
      setNotice(`Transfer ${created.transferId} created (${created.fromWarehouseId} -> ${created.toWarehouseId}).`)
      void refresh()
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Failed to create transfer'),
  })

  const dispatchMut = useMutation({
    mutationFn: (id: string) => dispatchTransfer(id),
    onSuccess: (trf) => {
      setErrorMsg(null)
      setNotice(`Transfer ${trf.transferId} dispatched: goods are now IN_TRANSIT and unsellable at both warehouses (SC09).`)
      void refresh()
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Failed to dispatch transfer'),
  })

  const receiveMut = useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: TransferReceiveLine[] }) =>
      receiveTransfer(id, lines),
    onSuccess: (trf) => {
      setErrorMsg(null)
      setReceiving(null)
      if (trf.status === 'RECEIVED_WITH_DISCREPANCY') {
        setNotice(
          `Transfer ${trf.transferId} received with discrepancy (SC09).${trf.exceptionCaseId ? ` Exception case ${trf.exceptionCaseId} opened.` : ''}`
        )
      } else {
        setNotice(`Transfer ${trf.transferId} received cleanly into destination stock.`)
      }
      void refresh()
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Failed to receive transfer'),
  })

  const openReceiveModal = (trf: WarehouseTransfer) => {
    const initial: Record<string, TransferReceiveLine> = {}
    for (const it of trf.items) {
      initial[it.skuId] = {
        skuId: it.skuId,
        receivedGoodQty: it.quantity,
        damagedQty: 0,
        missingQty: 0,
      }
    }
    setReceiveLines(initial)
    setReceiving(trf)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-ink">Inter-Warehouse Stock Transfers (SC09)</h2>
        <p className="mt-1 text-sm text-ink-2">
          Move goods between <strong>WH-HCM-01</strong> and <strong>WH-HN-01</strong>. Goods in transit cannot be sold at either warehouse, and any shortage or damage on receipt automatically opens an SC09 exception case.
        </p>
      </div>

      {errorMsg && <FormAlert message={errorMsg} />}
      {notice && (
        <div role="status" className="rounded border border-rule bg-paper-2 px-4 py-3 text-sm text-ink">
          {notice}
        </div>
      )}

      {/* Create Transfer Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErrorMsg(null)
          createMut.mutate()
        }}
        className="rounded-card border border-rule bg-paper p-5 space-y-4"
      >
        <h3 className="font-label text-base font-semibold text-ink">Create New Transfer</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-label text-ink">From Warehouse</span>
            <select
              value={fromWh}
              onChange={(e) => setFromWh(e.target.value)}
              className="h-10 rounded border border-rule-2 bg-paper px-3 text-ink"
            >
              {(hasAll ? WAREHOUSES : scopedWarehouses).map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-label text-ink">To Warehouse</span>
            <select
              value={toWh}
              onChange={(e) => setToWh(e.target.value)}
              className="h-10 rounded border border-rule-2 bg-paper px-3 text-ink"
            >
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-label text-ink">SKU ID</span>
            <input
              type="text"
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              required
              className="h-10 rounded border border-rule-2 bg-paper px-3 text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-label text-ink">Quantity</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="h-10 rounded border border-rule-2 bg-paper px-3 text-ink"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex-1 min-w-[16rem] flex flex-col gap-1 text-sm">
            <span className="font-label text-ink">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10 rounded border border-rule-2 bg-paper px-3 text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={createMut.isPending || fromWh === toWh}
            className="btn btn-primary h-10"
          >
            {createMut.isPending ? 'Creating...' : 'Create Draft Transfer'}
          </button>
        </div>
      </form>

      {/* Transfers List */}
      <div className="rounded-card border border-rule bg-paper overflow-x-auto">
        {transfersQuery.isLoading ? (
          <p className="p-6 text-sm text-ink-2">Loading transfers...</p>
        ) : (transfersQuery.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-ink-2">No inter-warehouse transfers recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-2 text-xs uppercase text-ink-2">
                <th className="px-4 py-3">Transfer ID</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SC09 Case</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {(transfersQuery.data ?? []).map((trf) => {
                const canDispatch =
                  trf.status === 'DRAFT' && (hasAll || scopedWarehouses.includes(trf.fromWarehouseId))
                const canReceive =
                  trf.status === 'IN_TRANSIT' && (hasAll || scopedWarehouses.includes(trf.toWarehouseId))
                return (
                  <tr key={trf.transferId}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">
                      {trf.transferId}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {trf.fromWarehouseId} &rarr; {trf.toWarehouseId}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {trf.items.map((it) => (
                        <div key={it.skuId}>
                          {it.skuId} &times; {it.quantity}
                          {trf.status.startsWith('RECEIVED') && (
                            <span className="ml-2 text-xs text-muted">
                              (good {it.receivedGoodQty}, damaged {it.damagedQty}, missing {it.missingQty})
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[trf.status] ?? 'bg-paper-2'}`}>
                        {trf.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {trf.exceptionCaseId ? (
                        <Link href="/admin/cases" className="font-mono text-accent underline">
                          {trf.exceptionCaseId}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {canDispatch && (
                        <button
                          type="button"
                          onClick={() => dispatchMut.mutate(trf.transferId)}
                          disabled={dispatchMut.isPending}
                          className="btn btn-secondary px-3 py-1 text-xs"
                        >
                          Dispatch (In Transit)
                        </button>
                      )}
                      {canReceive && (
                        <button
                          type="button"
                          onClick={() => openReceiveModal(trf)}
                          className="btn btn-primary px-3 py-1 text-xs"
                        >
                          Receive &amp; QC
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Receive & QC Modal */}
      {receiving && (
        <div role="dialog" aria-label="Receive transfer QC" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-rule bg-paper p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-ink">
              Receive &amp; QC Transfer {receiving.transferId} ({receiving.fromWarehouseId} &rarr; {receiving.toWarehouseId})
            </h3>
            <p className="text-xs text-ink-2">
              Good + Damaged + Missing must equal dispatched quantity. Any missing or damaged units will open an SC09 exception case instead of altering the count.
            </p>
            <div className="space-y-3">
              {receiving.items.map((it) => {
                const line = receiveLines[it.skuId] ?? {
                  skuId: it.skuId,
                  receivedGoodQty: it.quantity,
                  damagedQty: 0,
                  missingQty: 0,
                }
                const updateField = (field: 'receivedGoodQty' | 'damagedQty' | 'missingQty', val: number) => {
                  setReceiveLines((prev) => ({
                    ...prev,
                    [it.skuId]: { ...line, [field]: Math.max(0, val) },
                  }))
                }
                return (
                  <div key={it.skuId} className="rounded border border-rule p-3 space-y-2 text-sm">
                    <div className="font-semibold text-ink">
                      {it.skuId} (Dispatched: {it.quantity})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs">
                        Good
                        <input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={line.receivedGoodQty}
                          onChange={(e) => updateField('receivedGoodQty', Number(e.target.value))}
                          className="mt-1 w-full rounded border border-rule-2 px-2 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        Damaged
                        <input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={line.damagedQty}
                          onChange={(e) => updateField('damagedQty', Number(e.target.value))}
                          className="mt-1 w-full rounded border border-rule-2 px-2 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        Missing
                        <input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={line.missingQty}
                          onChange={(e) => updateField('missingQty', Number(e.target.value))}
                          className="mt-1 w-full rounded border border-rule-2 px-2 py-1"
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceiving(null)}
                className="btn btn-secondary px-4 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={receiveMut.isPending}
                onClick={() =>
                  receiveMut.mutate({
                    id: receiving.transferId,
                    lines: Object.values(receiveLines),
                  })
                }
                className="btn btn-primary px-4 py-1.5 text-sm"
              >
                {receiveMut.isPending ? 'Recording...' : 'Confirm Receipt & QC'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
