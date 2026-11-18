'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { ORDERS_KEY, listOrders } from '@/orders/order-api'
import { orderStatusLabel } from '@/orders/order-state'

const PAGE_SIZE = 10

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function OrderHistory() {
  const [page, setPage] = useState(1)
  const orders = useQuery({
    queryKey: [...ORDERS_KEY, page],
    queryFn: () => listOrders({ page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  if (orders.isError)
    return (
      <div className="mt-6">
        <FormAlert message="We could not load your orders. Please reload the page." />
      </div>
    )
  if (!orders.data)
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading your orders…
      </p>
    )
  if (orders.data.items.length === 0)
    return (
      <div className="mt-6 max-w-[40rem] border-t border-rule-2 bg-paper-2 px-6 py-8">
        <p className="font-label text-lg text-ink">You have not placed an order yet</p>
        <Link href="/" className="btn btn-primary mt-4">
          Start shopping
        </Link>
      </div>
    )

  return (
    <div className="mt-6 max-w-[48rem]">
      <ul aria-label="Your orders" className="divide-y divide-rule border-y border-rule">
        {orders.data.items.map((order) => (
          <li
            key={order.orderId}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/account/orders/${encodeURIComponent(order.orderId)}`}
                  className="font-label text-ink"
                >
                  Order {order.orderId}
                </Link>
                {order.paymentMethod === 'COD' && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                    COD
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {dateFormat.format(new Date(order.createdAt))} ·{' '}
                {order.itemCount === 1 ? '1 item' : `${order.itemCount} items`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-label text-ink">{formatVnd(order.totalPayableVnd)}</p>
              <p className="text-sm text-ink-2">{orderStatusLabel(order.status)}</p>
            </div>
          </li>
        ))}
      </ul>
      {orders.data.pageCount > 1 && (
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
