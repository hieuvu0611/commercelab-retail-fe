// Order and payment API types (Phase 5), reconciled with the real order and payment services in P5-T14
// (docs: progress-coding/details/phase-05-order-payment.md); src/orders/adapters.ts maps the raw responses onto them.
// Amounts are integer VND and include VAT.

/** Order saga states: being placed, stock held and waiting for payment, payment result unknown, paid, or closed. */
export const ORDER_STATUSES = [
  'PENDING',
  'RESERVED',
  'UNKNOWN_HOLD',
  'CONFIRMED',
  'FAILED_CLOSED',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PROCESSING',
  'UNKNOWN_30M',
  'CAPTURED',
  'FAILED',
  'REFUND_PENDING',
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
  /** The payment attempt id (PAY-<orderId>); empty until the attempt exists. */
  paymentAttemptId: string
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp the stock reservation is held until; null when the order has none. */
  expiresAt: string | null
  /** Money received after the order closed that has to be refunded; 0 when none is owed. */
  refundObligationVnd: number
}

/**
 * Outcomes the payment simulator can report (POST /payments/simulator/{attemptId}/outcome). A late payment is
 * CAPTURED reported after the order closed.
 */
export const SIMULATOR_OUTCOMES = ['CAPTURED', 'FAILED', 'UNKNOWN'] as const
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
  failureCode: string | null
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

/** A row of the backoffice order list: GET /admin/orders. The recipient and phone are masked. */
export interface StaffOrderRow {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  failureCode: string | null
  totalPayableVnd: number
  createdAt: string
  itemCount: number
  customerId: string
  warehouseId: string
  shipTo: StaffShipTo | null
}

/** Delivery information for staff with personal data minimised: no street address, masked phone and name. */
export interface StaffShipTo {
  recipient: string
  phone: string
  district: string
  province: string
}

/** The backoffice order detail: GET /admin/orders/{id}. */
export interface StaffOrderDetail extends Omit<OrderDetail, 'address'> {
  customerId: string
  warehouseId: string
  shipTo: StaffShipTo | null
}
