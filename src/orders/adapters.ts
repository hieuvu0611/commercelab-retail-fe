import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type Order,
  type OrderStatus,
  type PaymentStatus,
} from '@/types/order'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

/** An unrecognised status is treated as "being verified": the safe reading, since it never invites a second payment. */
const orderStatus = (value: unknown): OrderStatus =>
  ORDER_STATUSES.find((status) => status === value) ?? 'UNKNOWN_HOLD'

const paymentStatus = (value: unknown): PaymentStatus =>
  PAYMENT_STATUSES.find((status) => status === value) ?? 'UNKNOWN'

export function toOrder(raw: unknown): Order {
  const order = asRaw(raw)
  return {
    orderId: text(order.orderId),
    status: orderStatus(order.status),
    paymentStatus: paymentStatus(order.paymentStatus),
    failureCode: text(order.failureCode) || null,
    totalPayableVnd: whole(order.totalPayableVnd),
    paymentAttemptId: text(order.paymentAttemptId),
    createdAt: text(order.createdAt),
    unknownDeadline: text(order.unknownDeadline) || null,
    refundObligationVnd: whole(order.refundObligationVnd),
  }
}
