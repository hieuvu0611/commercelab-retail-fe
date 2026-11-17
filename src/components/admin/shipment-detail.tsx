'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/commons/confirm-dialog'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import {
  SHIPMENTS_KEY,
  getShipment,
  handOverShipment,
  packShipment,
  scanSku,
  shipmentKey,
} from '@/fulfillment/shipments-api'
import {
  SHIPMENT_ROLES,
  isFullyPicked,
  isPickable,
  isStaleVersion,
  shipmentProblem,
  shipmentStatusLabel,
} from '@/fulfillment/shipment-state'
import { ApiError } from '@/services/api/api-error'
import type { ShipmentDetail } from '@/types/fulfillment'
import { formatDateTime } from '@/utils/format'
import { formatVnd } from '@/catalog/money'
import { collectCODPayment, cancelCODPayment } from '@/orders/order-api'
import { ShortagePanel } from './shipment-shortage-panel'
import { StaffOnly } from './staff-only'
import { StopAlertBanner } from './stop-alert-banner'

export function ShipmentAdminDetail({ shipmentId }: { shipmentId: string }) {
  return (
    <StaffOnly role={SHIPMENT_ROLES} what="work the shipment queue">
      <StopAlertBanner />
      <ShipmentWorkbench shipmentId={shipmentId} />
    </StaffOnly>
  )
}

const backLink = (
  <Link href="/admin/shipments" className="underline">
    Back to shipments
  </Link>
)

function ShipmentWorkbench({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient()
  const shipment = useQuery({
    queryKey: shipmentKey(shipmentId),
    queryFn: () => getShipment(shipmentId),
    retry: false,
  })
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string }>()
  const [panel, setPanel] = useState<'handover' | 'shortage' | null>(null)
  const [skuCode, setSkuCode] = useState('')
  const [quantity, setQuantity] = useState('1')
  const skuRef = useRef<HTMLInputElement>(null)

  /** Every action answers with the shipment as it is now; a stale version reloads it. */
  const settle = {
    onSuccess: (updated: ShipmentDetail, message?: string) => {
      queryClient.setQueryData(shipmentKey(shipmentId), updated)
      void queryClient.invalidateQueries({ queryKey: SHIPMENTS_KEY })
      setFeedback(message ? { kind: 'ok', message } : undefined)
    },
    onError: (error: unknown) => {
      if (isStaleVersion(error))
        void queryClient.invalidateQueries({ queryKey: shipmentKey(shipmentId) })
      setFeedback({ kind: 'error', message: shipmentProblem(error) })
    },
  }
  const version = shipment.data?.version ?? 0
  const scan = useMutation({
    mutationFn: (input: { skuId: string; quantity: number }) =>
      scanSku(shipmentId, { ...input, version }),
    onSuccess: (updated, input) => {
      settle.onSuccess(updated, `Picked ${input.quantity} × ${input.skuId}`)
      setSkuCode('')
      setQuantity('1')
    },
    onError: settle.onError,
    onSettled: () => skuRef.current?.focus(),
  })
  const pack = useMutation({
    mutationFn: () => packShipment(shipmentId, version),
    onSuccess: (updated) => settle.onSuccess(updated, 'Shipment packed'),
    onError: settle.onError,
  })
  const handOver = useMutation({
    mutationFn: () => handOverShipment(shipmentId, version),
    onSuccess: (updated) => settle.onSuccess(updated, 'Shipment handed to the carrier'),
    onError: settle.onError,
    onSettled: () => setPanel(null),
  })
  const collectCod = useMutation({
    mutationFn: (orderId: string) =>
      collectCODPayment(orderId, shipment.data?.codAmountToCollect),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shipmentKey(shipmentId) })
      void queryClient.invalidateQueries({ queryKey: SHIPMENTS_KEY })
      setFeedback({ kind: 'ok', message: 'Carrier COD collection confirmed successfully' })
    },
    onError: settle.onError,
  })
  const cancelCod = useMutation({
    mutationFn: (orderId: string) =>
      cancelCODPayment(orderId, 'Carrier delivery failed or customer rejected parcel'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shipmentKey(shipmentId) })
      void queryClient.invalidateQueries({ queryKey: SHIPMENTS_KEY })
      setFeedback({ kind: 'ok', message: 'Delivery marked failed; parcel set to Return-to-Sender' })
    },
    onError: settle.onError,
  })

  if (shipment.isError) {
    const isScope = shipment.error instanceof ApiError && shipment.error.status === 403
    return (
      <div className="mt-6 flex flex-col gap-3">
        <FormAlert
          message={
            isScope
              ? shipmentProblem(shipment.error)
              : 'We could not load this shipment. Please reload the page.'
          }
        />
        {backLink}
      </div>
    )
  }
  if (!shipment.data)
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading shipment…
      </p>
    )

  const data = shipment.data
  const canPick = isPickable(data)
  const isBusy =
    scan.isPending ||
    pack.isPending ||
    handOver.isPending ||
    collectCod.isPending ||
    cancelCod.isPending

  const submitScan = (event: FormEvent) => {
    event.preventDefault()
    const skuId = skuCode.trim()
    const count = Number(quantity)
    if (!skuId) return setFeedback({ kind: 'error', message: 'Scan or type a SKU code first.' })
    if (!Number.isInteger(count) || count < 1)
      return setFeedback({
        kind: 'error',
        message: 'Quantity must be a whole number of 1 or more.',
      })
    scan.mutate({ skuId, quantity: count })
  }

  return (
    <div className="mt-6">
      <p className="mb-4 text-sm">{backLink}</p>
      <h2 className="text-2xl">Shipment {data.shipmentId}</h2>
      <dl className="mt-2 grid max-w-[34rem] grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-2">Order</dt>
        <dd>{data.orderId}</dd>
        <dt className="text-ink-2">Warehouse</dt>
        <dd>{data.warehouseId}</dd>
        <dt className="text-ink-2">Status</dt>
        <dd className="font-label text-ink">{shipmentStatusLabel(data.status)}</dd>
        <dt className="text-ink-2">Payment</dt>
        <dd>
          {data.paymentMethod === 'COD' ? (
            <span className="font-semibold text-amber-800">
              Cash on Delivery (COD) — Collect {formatVnd(data.codAmountToCollect ?? 0)}
            </span>
          ) : (
            'Prepaid Online'
          )}
        </dd>
        {data.handedOverAt && (
          <>
            <dt className="text-ink-2">Handed over</dt>
            <dd>{formatDateTime(data.handedOverAt)}</dd>
          </>
        )}
      </dl>

      {data.status === 'PICK_BLOCKED' && (
        <p className="mt-4 max-w-[40rem] border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink">
          Shortage reported: {data.failureReason}. This shipment will not be dispatched.
        </p>
      )}

      <div aria-live="polite" className="mt-4 max-w-[40rem]">
        {feedback?.kind === 'ok' && (
          <p
            role="status"
            className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
          >
            {feedback.message}
          </p>
        )}
        {feedback?.kind === 'error' && <FormAlert message={feedback.message} />}
      </div>

      {canPick && (
        <form onSubmit={submitScan} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
          <div className="w-64">
            <TextField
              ref={skuRef}
              label="SKU code"
              value={skuCode}
              onChange={(event) => setSkuCode(event.target.value)}
              autoComplete="off"
              autoFocus
              hint="Scan the barcode or type the code, then press Enter."
            />
          </div>
          <div className="w-24">
            <TextField
              label="Quantity"
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={isBusy}>
            Verify and pick
          </button>
        </form>
      )}

      <div className="relative mt-8 overflow-x-auto">
        <table className="w-full min-w-[30rem] max-w-[44rem] border-collapse text-left text-sm">
          <caption className="sr-only">Pick list</caption>
          <thead>
            <tr className="border-b border-rule-2 text-ink">
              {['SKU', 'Ordered', 'Picked', 'Left'].map((heading) => (
                <th key={heading} scope="col" className="font-label py-3 pr-4">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.skuId} className="border-b border-rule align-top">
                <th scope="row" className="py-3 pr-4 font-normal text-ink">
                  {line.skuId}
                </th>
                <td className="py-3 pr-4 tabular-nums">{line.orderedQuantity}</td>
                <td className="py-3 pr-4 tabular-nums">{line.pickedQuantity}</td>
                <td className="py-3 tabular-nums">
                  {Math.max(line.orderedQuantity - line.pickedQuantity, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canPick && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isBusy || !isFullyPicked(data)}
            onClick={() => pack.mutate()}
          >
            Mark as packed
          </button>
        )}
        {data.status === 'PACKED' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isBusy}
            onClick={() => setPanel('handover')}
          >
            Hand over to carrier
          </button>
        )}
        {canPick && (
          <button type="button" className="btn btn-secondary" onClick={() => setPanel('shortage')}>
            Report a shortage
          </button>
        )}
        {data.paymentMethod === 'COD' &&
          (data.status === 'HANDED_OVER' || data.status === 'IN_TRANSIT') && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isBusy}
                onClick={() => collectCod.mutate(data.orderId)}
              >
                Confirm COD Collected / Xác nhận đã thu tiền
              </button>
              <button
                type="button"
                className="btn btn-secondary text-error"
                disabled={isBusy}
                onClick={() => cancelCod.mutate(data.orderId)}
              >
                Delivery Failed (Return to Sender) / Giao thất bại
              </button>
            </>
          )}
      </div>
      {canPick && !isFullyPicked(data) && (
        <p className="mt-2 text-sm text-muted">Pick every line before packing.</p>
      )}

      {panel === 'handover' && (
        <ConfirmDialog
          title="Hand over to the carrier?"
          confirmLabel="Hand over"
          isBusy={handOver.isPending}
          onConfirm={() => handOver.mutate()}
          onCancel={() => setPanel(null)}
        >
          Parcel for order {data.orderId} will be released to the carrier and stock will be taken
          off the shelf. This cannot be undone.
        </ConfirmDialog>
      )}
      {panel === 'shortage' && (
        <ShortagePanel
          shipmentId={shipmentId}
          lines={data.lines}
          version={data.version}
          onCancel={() => setPanel(null)}
          onDone={(updated) => {
            settle.onSuccess(updated, 'Shortage reported. The shipment is blocked.')
            setPanel(null)
          }}
          onFailed={settle.onError}
        />
      )}
    </div>
  )
}
