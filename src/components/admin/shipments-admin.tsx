'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { warehousesInScope } from '@/inventory/scope'
import { SHIPMENTS_KEY, listShipments } from '@/fulfillment/shipments-api'
import { SHIPMENT_ROLES, shipmentStatusLabel } from '@/fulfillment/shipment-state'
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@/types/fulfillment'
import { formatDateTime } from '@/utils/format'
import { StaffOnly } from './staff-only'
import { StopAlertBanner } from './stop-alert-banner'

const PAGE_SIZE = 15

export function ShipmentsAdmin() {
  return (
    <StaffOnly role={SHIPMENT_ROLES} what="work the shipment queue">
      <StopAlertBanner />
      <ShipmentQueue />
    </StaffOnly>
  )
}

function ShipmentQueue() {
  const { data: session } = useSession()
  const warehouses = warehousesInScope(session?.user?.warehouseScopes ?? [])
  const [status, setStatus] = useState<ShipmentStatus | ''>('')
  const [page, setPage] = useState(1)
  const shipments = useQuery({
    queryKey: [...SHIPMENTS_KEY, { status, page }],
    queryFn: () => listShipments({ status, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="shipment-status" className="font-label text-sm text-ink">
            Status
          </label>
          <select
            id="shipment-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ShipmentStatus | '')
              setPage(1)
            }}
            className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink"
          >
            <option value="">All</option>
            {SHIPMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {shipmentStatusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        {warehouses.length > 0 && (
          <p className="pb-3 text-sm text-ink-2">
            {warehouses.length === 1 ? 'Showing warehouse' : 'Showing warehouses'}{' '}
            {warehouses.join(', ')}
          </p>
        )}
      </div>

      <div className="relative mt-8 overflow-x-auto">
        {shipments.isError ? (
          <FormAlert message="We could not load the shipments. Please reload the page." />
        ) : !shipments.data ? (
          <p role="status" className="text-ink-2">
            Loading shipments…
          </p>
        ) : shipments.data.items.length === 0 ? (
          <p className="text-ink-2">No shipments match.</p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Shipments</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {['Shipment', 'Order', 'Warehouse', 'Items', 'Status', 'Created'].map((heading) => (
                  <th key={heading} scope="col" className="font-label py-3 pr-4">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipments.data.items.map((shipment) => (
                <tr key={shipment.shipmentId} className="border-b border-rule align-top">
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    <Link href={`/admin/shipments/${encodeURIComponent(shipment.shipmentId)}`}>
                      {shipment.shipmentId}
                    </Link>
                  </th>
                  <td className="py-3 pr-4">{shipment.orderId}</td>
                  <td className="py-3 pr-4">{shipment.warehouseId}</td>
                  <td className="py-3 pr-4">{shipment.itemCount}</td>
                  <td className="py-3 pr-4">{shipmentStatusLabel(shipment.status)}</td>
                  <td className="py-3">{formatDateTime(shipment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {shipments.data && shipments.data.pageCount > 1 && (
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
            Page {page} of {shipments.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= shipments.data.pageCount}
            onClick={() => setPage((c) => c + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
