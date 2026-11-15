import { formatVnd } from '@/catalog/money'
import { ApiError } from '@/services/api/api-error'
import type { Order, OrderStatus } from '@/types/order'

export type PaymentTone = 'waiting' | 'verifying' | 'success' | 'failed' | 'closed' | 'late'

export interface PaymentView {
  tone: PaymentTone
  title: string
  body: string
  /** The simulator can still report an outcome for this order. */
  canSimulate: boolean
  /** The page keeps asking the server until the order settles. */
  isPending: boolean
}

/** Payment was received: the order is confirmed, in fulfilment or delivered. */
export const isPaidStatus = (status: OrderStatus): boolean =>
  status === 'CONFIRMED' || status === 'IN_FULFILLMENT' || status === 'DELIVERED'

/** What the payment page tells the customer for an order's state. Never invites a second payment while unknown. */
export function describePayment(order: Order): PaymentView {
  const { status, paymentStatus } = order
  if (isPaidStatus(status))
    return {
      tone: 'success',
      title: 'Payment received',
      body: `Your order ${order.orderId} is confirmed.`,
      canSimulate: false,
      isPending: false,
    }
  if (status === 'UNKNOWN_HOLD')
    return {
      tone: 'verifying',
      title: 'We are verifying your payment',
      body: 'We have not received the result from the payment provider yet. Do not pay again: your items stay reserved and this page updates by itself.',
      canSimulate: true,
      isPending: true,
    }
  if (status === 'PENDING')
    return {
      tone: 'waiting',
      title: 'We are placing your order',
      body: 'This only takes a moment. Please do not pay yet: this page updates by itself.',
      canSimulate: false,
      isPending: true,
    }
  if (status === 'RESERVED')
    return {
      tone: 'waiting',
      title: 'Waiting for your payment',
      body: `Your items are reserved for you. Pay ${formatVnd(order.totalPayableVnd)} to confirm order ${order.orderId}.`,
      canSimulate: true,
      isPending: true,
    }
  if (paymentStatus === 'REFUND_PENDING')
    return {
      tone: 'late',
      title: 'Your payment arrived too late',
      body: `The order was already closed, so it is not restored. We will refund ${formatVnd(order.refundObligationVnd || order.totalPayableVnd)} to you.`,
      canSimulate: false,
      isPending: false,
    }
  if (order.failureCode === 'PAYMENT_UNKNOWN_EXPIRED')
    return {
      tone: 'closed',
      title: 'We could not confirm your payment',
      body: 'We did not hear back within 30 minutes, so the order was closed and the items were released. If money was taken from you, it will be refunded.',
      canSimulate: true,
      isPending: false,
    }
  if (order.failureCode === 'RESERVATION_EXPIRED')
    return {
      tone: 'closed',
      title: 'Your reservation expired',
      body: 'The items were held for 10 minutes and no payment arrived, so they were released and nothing was charged. Please go back to your cart and try again.',
      canSimulate: false,
      isPending: false,
    }
  if (paymentStatus === 'FAILED' || order.failureCode === 'PAYMENT_FAILED')
    return {
      tone: 'failed',
      title: 'Payment failed',
      body: 'The payment was declined and nothing was charged. The items we held for you were released. You can go back to your cart and try again.',
      canSimulate: false,
      isPending: false,
    }
  return {
    tone: 'closed',
    title: 'This order could not be completed',
    body: 'The order was closed and nothing was charged. Please go back to your cart and try again.',
    canSimulate: false,
    isPending: false,
  }
}

export interface PlaceOrderProblem {
  message: string
  /**
   * retry: send the same request with the same key; new-quote: the quote has to be priced again;
   * cart: the cart has to change.
   */
  kind: 'retry' | 'new-quote' | 'cart'
}

/** How a refused or failed place-order call is explained and what the customer can do next. */
export function placeOrderProblem(error: unknown): PlaceOrderProblem {
  const code = error instanceof ApiError ? error.code : ''
  if (code === 'QUOTE_EXPIRED' || code === 'QUOTE_NOT_FOUND')
    return {
      kind: 'new-quote',
      message: 'Your quote expired. Please get a new quote and accept it again.',
    }
  if (code === 'QUOTE_CHANGED' || code === 'QUOTE_INVALID')
    return {
      kind: 'new-quote',
      message:
        'Prices or availability changed since your quote. Nothing was charged. Please get a new quote.',
    }
  if (code === 'ADDRESS_NOT_FOUND')
    return {
      kind: 'new-quote',
      message:
        'The delivery address is no longer available. Please choose an address and get a new quote.',
    }
  if (code === 'OUT_OF_STOCK')
    return {
      kind: 'cart',
      message: 'An item sold out while you were checking out. Nothing was charged.',
    }
  if (code.startsWith('VOUCHER_'))
    return {
      kind: 'new-quote',
      message: 'The voucher can no longer be used. Nothing was charged. Please get a new quote.',
    }
  if (code === 'IDEMPOTENCY_KEY_REUSED')
    return {
      kind: 'new-quote',
      message: 'This request was already used for different items. Please get a new quote.',
    }
  return {
    kind: 'retry',
    message:
      'We could not place your order. Nothing was charged. You can safely try again: you will not be charged twice.',
  }
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Being placed',
  RESERVED: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  IN_FULFILLMENT: 'Being prepared for dispatch',
  DELIVERED: 'Delivered',
  UNKNOWN_HOLD: 'Verifying payment',
  FAILED_CLOSED: 'Closed',
}

export const orderStatusLabel = (status: OrderStatus): string => STATUS_LABELS[status]
