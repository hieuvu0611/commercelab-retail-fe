// Order and payment API types (Phase 5). The shapes are a contract guess from the P5-T04/T05/T06 task notes
// (docs: progress-coding/details/phase-05-order-payment.md); src/orders/adapters.ts maps the raw responses onto them,
// so reconciling with the real services happens in that file. Amounts are integer VND and include VAT.

/** Order saga states: stock held and waiting for payment, paid, payment result unknown, or closed unpaid. */
export const ORDER_STATUSES = ['RESERVED', 'CONFIRMED', 'UNKNOWN_HOLD', 'FAILED_CLOSED'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = [
  'PROCESSING',
  'UNKNOWN',
  'CAPTURED',
  'FAILED',
  'EXPIRED_30M',
  'CAPTURED_LATE',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** An order as the payment page needs it: POST /orders, GET /orders/{id}. */
export interface Order {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  /** Why a closed order failed, for example PAYMENT_FAILED or OUT_OF_STOCK; null otherwise. */
  failureCode: string | null
  totalPayableVnd: number
  paymentAttemptId: string
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp the unknown payment is held until (30 minutes); null unless the payment was unknown. */
  unknownDeadline: string | null
  /** Money received after the order closed that has to be refunded. */
  refundObligationVnd: number
}

/**
 * Outcomes the payment simulator can report (POST /payments/simulator/{attemptId}/outcome). LATE is a development
 * shortcut for "the money arrives after the 30-minute window".
 */
export const SIMULATOR_OUTCOMES = ['CAPTURED', 'FAILED', 'UNKNOWN', 'LATE'] as const
export type SimulatorOutcome = (typeof SIMULATOR_OUTCOMES)[number]

/** One line of the commercial snapshot frozen when the order was placed (I04). Later price changes never touch it. */
export interface OrderLine {
  skuId: string
  skuName: string
  imageUrl: string | null
  quantity: number
  unitPriceVnd: number
  lineSubtotalVnd: number
  /** This line's share of the voucher discount. */
  lineDiscountVnd: number
  lineNetPayableVnd: number
  /** What the customer effectively paid for one unit after the voucher share (the base of any refund). */
  allocatedUnitPaidVnd: number
}

/** The delivery address as it was when the order was placed. */
export interface OrderAddress {
  recipient: string
  phone: string
  line1: string
  ward: string
  district: string
  province: string
}

/** A row of the customer's order history: GET /orders. */
export interface OrderSummary {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  totalPayableVnd: number
  createdAt: string
  itemCount: number
}

/** An order with its frozen commercial snapshot: GET /orders/{id}. */
export interface OrderDetail extends Order {
  subtotalVnd: number
  discountVnd: number
  shippingFeeVnd: number
  voucherCode: string | null
  address: OrderAddress | null
  lines: OrderLine[]
}
