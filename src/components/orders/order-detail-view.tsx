'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { getOrderTracking, trackingKey } from '@/fulfillment/tracking-api'
import { getOrderDetail, orderDetailKey } from '@/orders/order-api'
import { CancelOrder } from './cancel-order'
import { OrderTracking } from './order-tracking'
import {
  canCancelOrder,
  describePayment,
  isPaidStatus,
  orderStatusLabel,
} from '@/orders/order-state'

/** The page asks again while the warehouse is still stopping the parcel, so the customer sees the outcome. */
const CANCEL_POLL_MS = 10_000

/** Tracking statuses that mean the parcel is with the carrier or beyond. */
const LEFT_WAREHOUSE = new Set([
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERY_FAILED',
  'PARTIALLY_DELIVERED',
])

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

/** One order with its frozen commercial snapshot. `isNew` shows the confirmation message right after paying. */
export function OrderDetailView({ orderId, isNew }: { orderId: string; isNew: boolean }) {
  const order = useQuery({
    queryKey: orderDetailKey(orderId),
    queryFn: () => getOrderDetail(orderId),
    refetchInterval: (query) =>
      query.state.data?.status === 'CANCEL_REQUESTED' ? CANCEL_POLL_MS : false,
  })

  // Same query as the tracking section, so it is fetched once: a parcel with the carrier can no longer be cancelled.
  const tracking = useQuery({
    queryKey: trackingKey(orderId),
    queryFn: () => getOrderTracking(orderId),
    enabled: order.data !== undefined && isPaidStatus(order.data.status),
  })

  if (order.isError)
    return (
      <div className="mt-6">
        <FormAlert message="We could not load this order. Please reload the page." />
      </div>
    )
  if (!order.data)
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading your order…
      </p>
    )

  const data = order.data
  const isConfirmed = isPaidStatus(data.status)
  const needsPayment = data.status === 'RESERVED' || data.status === 'UNKNOWN_HOLD'
  const payment = describePayment(data)
  // A refused request (parcel handed over first) is not stored: the order is back in fulfilment, and the tracking shows why.
  const isRefused =
    data.cancellation?.status === 'REFUSED' ||
    (data.status === 'IN_FULFILLMENT' &&
      tracking.data !== undefined &&
      tracking.data !== null &&
      LEFT_WAREHOUSE.has(tracking.data.status))
  const hasMoneyBack = data.status === 'CANCELLED' && data.refund !== null
  const showsTracking = isConfirmed || data.status === 'CANCEL_REQUESTED' || hasMoneyBack

  return (
    <div className="mt-6 flex max-w-[48rem] flex-col gap-8">
      {isNew && isConfirmed && (
        <section className="border-t-4 border-success bg-paper-2 px-5 py-5">
          <h2 className="text-xl">Thank you for your order</h2>
          <p className="mt-2 text-ink-2">Your order {data.orderId} is confirmed.</p>
        </section>
      )}

      <div>
        <h2 className="text-2xl">Order {data.orderId}</h2>
        <p className="mt-1 text-sm text-muted">
          Placed {dateFormat.format(new Date(data.createdAt))}
        </p>
        <p className="font-label mt-2 text-ink">{orderStatusLabel(data.status)}</p>
        {!isConfirmed && <p className="mt-1 text-ink-2">{payment.body}</p>}
        {isRefused && (
          <p className="mt-3 max-w-[40rem] border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink">
            Your cancellation request was refused: the parcel was already handed to the carrier, so
            the order could not be cancelled. After it is delivered you can request a return.
          </p>
        )}
        {data.status === 'CANCELLED' && data.refund && (
          <p className="mt-2 text-ink-2">
            Your refund of {formatVnd(data.refund.amountVnd)}{' '}
            {data.refund.status === 'COMPLETED' ? 'was completed.' : 'is pending.'}
          </p>
        )}
        {canCancelOrder(data.status) && !isRefused && <CancelOrder orderId={data.orderId} />}
        {needsPayment && (
          <Link
            href={`/checkout/payment/${encodeURIComponent(data.orderId)}`}
            className="btn btn-primary mt-3"
          >
            Continue to payment
          </Link>
        )}
      </div>

      {showsTracking && <OrderTracking orderId={data.orderId} />}

      <ul aria-label="Items" className="divide-y divide-rule border-y border-rule">
        {data.lines.map((line) => (
          <li key={line.skuId} className="flex gap-4 py-4">
            <div className="size-16 shrink-0 bg-paper-2">
              {line.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.imageUrl} alt="" className="size-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-label text-ink">{line.skuName}</p>
              <p className="text-muted">SKU {line.skuId}</p>
              <p className="flex justify-between text-ink-2">
                <span>
                  {line.quantity} × {formatVnd(line.unitPriceVnd)}
                </span>
                <span>{formatVnd(line.lineSubtotalVnd)}</span>
              </p>
              {line.lineDiscountVnd > 0 && (
                <p className="flex justify-between text-ink-2">
                  <span>Voucher share</span>
                  <span>−{formatVnd(line.lineDiscountVnd)}</span>
                </p>
              )}
              <p className="text-muted">You paid {formatVnd(line.allocatedUnitPaidVnd)} per unit</p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="flex max-w-[24rem] flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Goods</dt>
          <dd>{formatVnd(data.subtotalVnd)}</dd>
        </div>
        {data.discountVnd > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-2">Voucher {data.voucherCode}</dt>
            <dd>−{formatVnd(data.discountVnd)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-2">Shipping</dt>
          <dd>{data.shippingFeeVnd === 0 ? 'Free' : formatVnd(data.shippingFeeVnd)}</dd>
        </div>
        <div className="font-label mt-2 flex justify-between border-t border-rule-2 pt-3 text-lg text-ink">
          <dt>Total</dt>
          <dd>{formatVnd(data.totalPayableVnd)}</dd>
        </div>
      </dl>

      {data.address && (
        <section aria-labelledby="delivery-heading">
          <h3 id="delivery-heading" className="font-label text-lg text-ink">
            Delivery address
          </h3>
          <address className="mt-1 text-sm not-italic text-ink-2">
            <span className="font-label block text-ink">{data.address.recipient}</span>
            {data.address.phone}
            <br />
            {data.address.line1}, {data.address.ward}, {data.address.district},{' '}
            {data.address.province}
          </address>
        </section>
      )}
    </div>
  )
}
