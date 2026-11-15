'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { orderStatusLabel } from '@/orders/order-state'
import {
  STAFF_ORDERS_KEY,
  getStaffOrder,
  listStaffOrders,
  staffOrderKey,
} from '@/orders/staff-orders-api'
import { ORDER_VIEW_ROLES } from '@/orders/staff-roles'
import { ORDER_STATUSES, type OrderStatus, type PaymentStatus } from '@/types/order'
import { StaffOnly } from './staff-only'

const PAGE_SIZE = 15

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PROCESSING: 'Processing',
  UNKNOWN_30M: 'Unknown (30-minute window)',
  CAPTURED: 'Captured',
  FAILED: 'Failed',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
}

export function OrdersAdmin() {
  return (
    <StaffOnly role={ORDER_VIEW_ROLES} what="view orders">
      <OrderList />
    </StaffOnly>
  )
}

function OrderList() {
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [page, setPage] = useState(1)
  const orders = useQuery({
    queryKey: [...STAFF_ORDERS_KEY, { status, page }],
    queryFn: () => listStaffOrders({ status, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="order-status" className="font-label text-sm text-ink">
            Status
          </label>
          <select
            id="order-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus | '')
              setPage(1)
            }}
            className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink"
          >
            <option value="">All</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {orderStatusLabel(value)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative mt-8 overflow-x-auto">
        {orders.isError ? (
          <FormAlert message="We could not load the orders. Please reload the page." />
        ) : !orders.data ? (
          <p role="status" className="text-ink-2">
            Loading orders…
          </p>
        ) : orders.data.items.length === 0 ? (
          <p className="text-ink-2">No orders match.</p>
        ) : (
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">Orders</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {['Order', 'Placed', 'Recipient', 'Items', 'Total', 'Status', 'Payment'].map(
                  (heading) => (
                    <th key={heading} scope="col" className="font-label py-3 pr-4">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {orders.data.items.map((order) => (
                <tr key={order.orderId} className="border-b border-rule align-top">
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    <Link href={`/admin/orders/${encodeURIComponent(order.orderId)}`}>
                      {order.orderId}
                    </Link>
                  </th>
                  <td className="py-3 pr-4">{dateFormat.format(new Date(order.createdAt))}</td>
                  <td className="py-3 pr-4">{order.shipTo?.recipient ?? '—'}</td>
                  <td className="py-3 pr-4">{order.itemCount}</td>
                  <td className="py-3 pr-4">{formatVnd(order.totalPayableVnd)}</td>
                  <td className="py-3 pr-4">{orderStatusLabel(order.status)}</td>
                  <td className="py-3 pr-4">{PAYMENT_LABELS[order.paymentStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {orders.data && orders.data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {orders.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= orders.data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

export function OrderAdminDetail({ orderId }: { orderId: string }) {
  return (
    <StaffOnly role={ORDER_VIEW_ROLES} what="view orders">
      <OrderDetail orderId={orderId} />
    </StaffOnly>
  )
}

function OrderDetail({ orderId }: { orderId: string }) {
  const order = useQuery({
    queryKey: staffOrderKey(orderId),
    queryFn: () => getStaffOrder(orderId),
  })

  if (order.isError)
    return (
      <div className="mt-6 flex flex-col gap-3">
        <FormAlert message="We could not load this order. Please reload the page." />
        <Link href="/admin/orders" className="underline">
          Back to orders
        </Link>
      </div>
    )
  if (!order.data)
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading order…
      </p>
    )

  const data = order.data
  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <Link href="/admin/orders" className="text-sm underline">
          Back to orders
        </Link>
        <h2 className="mt-3 text-2xl">Order {data.orderId}</h2>
        <p className="mt-1 text-sm text-muted">
          Placed {dateFormat.format(new Date(data.createdAt))}
        </p>
      </div>

      <dl className="grid max-w-[32rem] grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-2">Status</dt>
        <dd>{orderStatusLabel(data.status)}</dd>
        <dt className="text-ink-2">Payment</dt>
        <dd>{PAYMENT_LABELS[data.paymentStatus]}</dd>
        {data.failureCode && (
          <>
            <dt className="text-ink-2">Failure code</dt>
            <dd>{data.failureCode}</dd>
          </>
        )}
        {data.refundObligationVnd > 0 && (
          <>
            <dt className="text-ink-2">Refund owed</dt>
            <dd>{formatVnd(data.refundObligationVnd)}</dd>
          </>
        )}
        {data.paymentAttemptId && (
          <>
            <dt className="text-ink-2">Payment attempt</dt>
            <dd>{data.paymentAttemptId}</dd>
          </>
        )}
      </dl>

      <ul aria-label="Items" className="max-w-[44rem] divide-y divide-rule border-y border-rule">
        {data.lines.map((line) => (
          <li key={line.skuId} className="py-3 text-sm">
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
            <p className="text-muted">Paid {formatVnd(line.allocatedUnitPaidVnd)} per unit</p>
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

      {data.shipTo && (
        <section aria-labelledby="ship-heading">
          <h3 id="ship-heading" className="font-label text-lg text-ink">
            Deliver to
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {data.shipTo.recipient} · {data.shipTo.phone}
            <br />
            {data.shipTo.district}, {data.shipTo.province}
          </p>
          <p className="mt-1 text-sm text-muted">
            Full address and phone are shown only where delivery needs them.
          </p>
        </section>
      )}
    </div>
  )
}
