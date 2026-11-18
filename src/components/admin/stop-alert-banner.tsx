'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { ConfirmDialog } from '@/components/commons/confirm-dialog'
import { confirmStop, getShipment, SHIPMENTS_KEY, shipmentKey } from '@/fulfillment/shipments-api'
import { useStopAlerts } from '@/fulfillment/use-stop-alerts'
import { warehousesInScope } from '@/inventory/scope'
import type { StopAlert, StopResolution } from '@/types/cancellation'

/** Statuses that mean the parcel already left the warehouse, so a refused stop is a resolution, not an error. */
const LEFT_WAREHOUSE = new Set([
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PARTIALLY_DELIVERED',
])

const RESOLUTION_TEXT: Record<StopResolution['outcome'], string> = {
  STOPPED: 'packing stopped. The order is cancelled and the stock is back on the shelf.',
  HANDED_OVER:
    'the parcel was handed over first, so the cancellation was refused. Support will help the customer.',
}

/**
 * Stop-packing alerts for the warehouses the person works in (SC06). An alert stays on screen until it is resolved:
 * by confirming the stop here, by the handover winning, or by someone else resolving it. It is never dismissed by a timer.
 */
export function StopAlertBanner() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const warehouses = warehousesInScope(session?.user?.warehouseScopes ?? [])
  const { alerts, resolutions, status, resolveHere, dismiss } = useStopAlerts(warehouses)
  const [asking, setAsking] = useState<StopAlert | null>(null)
  const [waiting, setWaiting] = useState<string[]>([])
  const [problem, setProblem] = useState<{ shipmentId: string; message: string }>()

  // A resolution changes the queue and the shipment page behind the banner.
  useEffect(() => {
    if (resolutions.length === 0) return
    void queryClient.invalidateQueries({ queryKey: SHIPMENTS_KEY })
    for (const { shipmentId } of resolutions)
      void queryClient.invalidateQueries({ queryKey: shipmentKey(shipmentId) })
  }, [resolutions, queryClient])

  const confirm = useMutation({
    mutationFn: (alert: StopAlert) => confirmStop(alert.shipmentId),
    onSuccess: (shipment, alert) => {
      setProblem(undefined)
      if (shipment.stopConfirmedAt && shipment.status !== 'STOPPED_FOR_CANCEL') {
        setWaiting((current) => current.includes(alert.shipmentId) ? current : [...current, alert.shipmentId])
        void queryClient.invalidateQueries({ queryKey: shipmentKey(alert.shipmentId) })
        return
      }
      resolveHere({ orderId: alert.orderId, shipmentId: alert.shipmentId, outcome: 'STOPPED' })
    },
    onError: async (_error, alert) => {
      // A refusal can mean the handover won: look at the shipment before calling it a failure.
      const shipment = await getShipment(alert.shipmentId).catch(() => null)
      if (shipment && (LEFT_WAREHOUSE.has(shipment.status) || shipment.stopRequestedAt === null))
        return resolveHere({
          orderId: alert.orderId,
          shipmentId: alert.shipmentId,
          outcome: 'HANDED_OVER',
        })
      setProblem({
        shipmentId: alert.shipmentId,
        message:
          'We could not confirm the stop. The alert stays open: check the shipment and try again.',
      })
    },
    onSettled: () => setAsking(null),
  })

  const isDown = status === 'reconnecting'
  if (alerts.length === 0 && resolutions.length === 0 && !isDown) return null

  return (
    <div className="mt-6 flex max-w-[48rem] flex-col gap-3">
      {isDown && (
        <p role="status" className="border-l-4 border-ink bg-paper-2 px-4 py-3 text-sm text-ink">
          Live alerts are reconnecting.{' '}
          {alerts.length > 0
            ? 'Alerts already shown stay here until they are resolved.'
            : 'New alerts may be delayed until the connection is back.'}
        </p>
      )}

      {alerts.map((alert) => (
        <article
          key={alert.shipmentId}
          role="alert"
          className="border-l-4 border-error bg-paper-2 px-5 py-4"
        >
          <h2 className="text-lg">Stop packing order {alert.orderId}</h2>
          <p className="mt-1 text-sm text-ink-2">
            The customer cancelled. Stop work on shipment {alert.shipmentId} ({alert.warehouseId})
            and confirm. If the parcel has already left, hand it over so the cancellation is
            refused.
          </p>
          {waiting.includes(alert.shipmentId) && (
            <p role="status" className="mt-2 text-sm">Stop recorded. Waiting for the other parcels.</p>
          )}
          {problem?.shipmentId === alert.shipmentId && (
            <div className="mt-3">
              <FormAlert message={problem.message} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => setAsking(alert)}>
              {waiting.includes(alert.shipmentId) ? 'Check stop status' : 'Confirm packing stopped'}
            </button>
            <Link
              href={`/admin/shipments/${encodeURIComponent(alert.shipmentId)}`}
              aria-label={`Open shipment ${alert.shipmentId}`}
              className="underline"
            >
              Open shipment
            </Link>
          </div>
        </article>
      ))}

      {resolutions.map((resolution) => (
        <p
          key={resolution.orderId}
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          <span>
            Order {resolution.orderId}: {RESOLUTION_TEXT[resolution.outcome]}
          </span>
          <button
            type="button"
            className="font-label min-h-11 text-ink-2 underline"
            onClick={() => dismiss(resolution.orderId)}
          >
            Dismiss
          </button>
        </p>
      ))}

      {asking && (
        <ConfirmDialog
          title="Confirm packing has stopped?"
          confirmLabel="Yes, packing has stopped"
          cancelLabel="Not yet"
          isBusy={confirm.isPending}
          onConfirm={() => !confirm.isPending && confirm.mutate(asking)}
          onCancel={() => setAsking(null)}
        >
          Confirm work has stopped on this parcel. Stock returns to the shelf once all parcels can be stopped.
        </ConfirmDialog>
      )}
    </div>
  )
}
