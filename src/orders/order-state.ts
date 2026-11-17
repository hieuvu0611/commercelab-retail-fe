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
  status === 'CONFIRMED' ||
  status === 'IN_FULFILLMENT' ||
  status === 'PARTIALLY_DELIVERED' ||
  status === 'DELIVERED'

/** The customer can ask to cancel until the parcel leaves; the service decides by timing and refuses the rest. */
export const canCancelOrder = (status: OrderStatus): boolean =>
  status === 'RESERVED' || status === 'CONFIRMED' || status === 'IN_FULFILLMENT'

/** What the payment page tells the customer for an order's state. Never invites a second payment while unknown. */
export function describePayment(order: Order): PaymentView {
  const { status, paymentStatus } = order
  if (
    order.paymentMethod === 'COD' ||
    paymentStatus === 'COD_PENDING' ||
    paymentStatus === 'COLLECTED' ||
    paymentStatus === 'COD_CANCELLED'
  ) {
    if (paymentStatus === 'COLLECTED') {
      return {
        tone: 'success',
        title: 'Đã thanh toán (Thu tiền mặt)',
        body: `Đơn hàng ${order.orderId} đã được thanh toán tiền mặt thành công khi nhận hàng.`,
        canSimulate: false,
        isPending: false,
      }
    }
    if (paymentStatus === 'COD_CANCELLED') {
      return {
        tone: 'closed',
        title: 'Đơn hàng đã huỷ',
        body: `Đơn hàng ${order.orderId} giao không thành công và đã bị huỷ.`,
        canSimulate: false,
        isPending: false,
      }
    }
    return {
      tone: 'success',
      title: 'Đơn hàng đã ghi nhận (COD)',
      body: `Đơn hàng ${order.orderId} đã được xác nhận. Quý khách vui lòng chuẩn bị số tiền mặt ${formatVnd(order.totalPayableVnd)} khi nhận hàng.`,
      canSimulate: false,
      isPending: false,
    }
  }
  if (status === 'CANCEL_REQUESTED')
    return {
      tone: 'waiting',
      title: 'Awaiting warehouse confirmation',
      body: 'We asked the warehouse to stop your parcel. Your order is not cancelled yet: this page updates by itself as soon as the warehouse confirms.',
      canSimulate: false,
      isPending: true,
    }
  if (status === 'CANCELLED')
    return {
      tone: 'closed',
      title: 'Order cancelled',
      body: 'This order was cancelled and will not be shipped.',
      canSimulate: false,
      isPending: false,
    }
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
  if (code === 'COD_CEILING_EXCEEDED')
    return {
      kind: 'retry',
      message: 'COD is only available for orders with total <= 2,000,000 VND. Please select prepaid payment.',
    }
  if (code === 'COD_VELOCITY_LIMIT_EXCEEDED')
    return {
      kind: 'retry',
      message: 'You have reached the maximum active COD orders limit (2). Please select prepaid payment or wait for your current orders.',
    }
  return {
    kind: 'retry',
    message:
      'We could not place your order. Nothing was charged. You can safely try again: you will not be charged twice.',
  }
}

const CANCEL_PROBLEMS: Record<string, string> = {
  ORDER_HANDED_OVER:
    'Your parcel has already been handed to the carrier, so the order can no longer be cancelled. After it is delivered you can request a return.',
  ORDER_BEING_PACKED:
    'Your parcel is being packed right now. Please try again in a moment: we will ask the warehouse to stop it.',
  PAYMENT_UNRESOLVED:
    'We are still verifying your payment, so the order cannot be cancelled yet. Please check back once we have the result.',
  ORDER_NOT_CANCELLABLE: 'This order can no longer be cancelled.',
}

/** How a refused or failed cancel call is explained. Never shows the service's own message. */
export function cancelProblem(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  return (
    CANCEL_PROBLEMS[code] ??
    'We could not confirm the cancellation. Check the order status before trying again: it is safe to try again, the order will not be cancelled twice.'
  )
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Being placed',
  RESERVED: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  IN_FULFILLMENT: 'Being prepared for dispatch',
  PARTIALLY_DELIVERED: 'Partially delivered (multi-parcel)',
  CANCEL_REQUESTED: 'Awaiting warehouse confirmation',
  CANCELLED: 'Cancelled',
  DELIVERED: 'Delivered',
  UNKNOWN_HOLD: 'Verifying payment',
  FAILED_CLOSED: 'Closed',
}

export const orderStatusLabel = (status: OrderStatus): string => STATUS_LABELS[status]
