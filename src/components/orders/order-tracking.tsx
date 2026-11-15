'use client'

import { useQuery } from '@tanstack/react-query'
import { FormAlert } from '@/components/auth/form-alert'
import { getOrderTracking, trackingKey } from '@/fulfillment/tracking-api'
import type { OrderTracking as Tracking, TrackingStatus } from '@/types/fulfillment'

const POLL_MS = 15_000

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

/** The headline for the latest status and the sentence for an event the service sent without one. */
const STATUS_TEXT: Record<TrackingStatus, { headline: string; event: string }> = {
  CONFIRMED: { headline: 'Order confirmed', event: 'Order confirmed' },
  PENDING_PICK: { headline: 'Order confirmed', event: 'Order confirmed' },
  PICKING: { headline: 'Being prepared', event: 'We are picking your items' },
  PACKING: { headline: 'Being packed', event: 'We are packing your order' },
  PACKED: { headline: 'Packed', event: 'Your order is packed' },
  HANDED_OVER: { headline: 'Handed to the carrier', event: 'Handed to the carrier' },
  IN_TRANSIT: { headline: 'On its way', event: 'Your parcel is on its way' },
  DELIVERED: { headline: 'Delivered', event: 'Delivered' },
  PARTIALLY_DELIVERED: { headline: 'Partly delivered', event: 'Part of your order was delivered' },
  PICK_BLOCKED: {
    headline: 'Being prepared',
    event: 'We are checking stock for your order',
  },
  STOPPED_FOR_CANCEL: { headline: 'Shipment stopped', event: 'Shipment stopped' },
  DELIVERY_FAILED: { headline: 'Delivery failed', event: 'Delivery attempt failed' },
}

/** Delivery tracking of a confirmed order: the status, the timeline and, after delivery, how long returns stay open. */
export function OrderTracking({ orderId }: { orderId: string }) {
  const tracking = useQuery({
    queryKey: trackingKey(orderId),
    queryFn: () => getOrderTracking(orderId),
    refetchInterval: (query) => (query.state.data?.status === 'DELIVERED' ? false : POLL_MS),
  })

  return (
    <section aria-labelledby="tracking-heading">
      <h3 id="tracking-heading" className="font-label text-lg text-ink">
        Delivery tracking
      </h3>
      {tracking.isError ? (
        <div className="mt-2">
          <FormAlert message="We could not load the tracking for this order. Please reload the page." />
        </div>
      ) : tracking.data === undefined ? (
        <p role="status" className="mt-2 text-ink-2">
          Loading tracking…
        </p>
      ) : tracking.data === null ? (
        <p className="mt-2 text-ink-2">
          Your order is confirmed. Tracking appears here once the warehouse starts preparing it.
        </p>
      ) : (
        <Timeline tracking={tracking.data} />
      )}
    </section>
  )
}

function Timeline({ tracking }: { tracking: Tracking }) {
  const newestFirst = [...tracking.events].reverse()

  return (
    <div className="mt-2">
      <p className="font-label text-ink">{STATUS_TEXT[tracking.status].headline}</p>
      {tracking.status === 'DELIVERED' && tracking.returnWindowEndsAt && (
        <ReturnWindow endsAt={tracking.returnWindowEndsAt} />
      )}
      {tracking.quantities.length > 0 && (
        <div className="mt-4 max-w-[34rem] overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
            <caption className="sr-only">Quantities per item</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {['Item', 'Ordered', 'Dispatched', 'Delivered', 'Returned'].map((heading) => (
                  <th key={heading} scope="col" className="font-label py-2 pr-4">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracking.quantities.map((line) => (
                <tr key={line.skuId} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-4 font-normal text-ink">
                    {line.skuId}
                  </th>
                  <td className="py-2 pr-4 tabular-nums">{line.ordered}</td>
                  <td className="py-2 pr-4 tabular-nums">{line.dispatched}</td>
                  <td className="py-2 pr-4 tabular-nums">{line.delivered}</td>
                  <td className="py-2 tabular-nums">{line.returned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ol aria-label="Tracking timeline" className="mt-4 flex flex-col border-l border-rule-2">
        {newestFirst.map((event, index) => (
          <li
            key={`${event.time}|${event.status}`}
            className="relative pb-5 pl-5 text-sm last:pb-0"
          >
            <span
              aria-hidden="true"
              className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ${index === 0 ? 'bg-ink' : 'bg-rule-2'}`}
            />
            <p className={index === 0 ? 'font-label text-ink' : 'text-ink-2'}>
              {event.label || STATUS_TEXT[event.status].event}
            </p>
            <p className="text-muted">
              <time dateTime={event.time}>{dateTime.format(new Date(event.time))}</time>
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ReturnWindow({ endsAt }: { endsAt: string }) {
  const date = dateOnly.format(new Date(endsAt))
  const isOpen = Date.now() <= Date.parse(endsAt)
  return (
    <p className="mt-2 border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink">
      {isOpen ? `Returns open until ${date}.` : `The return window closed on ${date}.`}
    </p>
  )
}
