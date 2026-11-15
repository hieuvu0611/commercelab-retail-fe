import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type Order,
  type OrderAddress,
  type OrderDetail,
  type OrderLine,
  type OrderStatus,
  type OrderSummary,
  type StaffOrderDetail,
  type StaffOrderRow,
  type StaffShipTo,
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

/** An unrecognised payment status is read as unpaid; the order status decides what the customer is told. */
const paymentStatus = (value: unknown): PaymentStatus =>
  PAYMENT_STATUSES.find((status) => status === value) ?? 'UNPAID'

/** The order as POST /orders and GET /orders/{id} return it: the payment and refund come nested in the detail. */
export function toOrder(raw: unknown): Order {
  const order = asRaw(raw)
  const payment = asRaw(order.payment)
  return {
    orderId: text(order.orderId),
    status: orderStatus(order.status),
    paymentStatus: paymentStatus(order.paymentStatus),
    failureCode: text(order.failureCode) || null,
    totalPayableVnd: whole(order.totalPayableVnd),
    paymentAttemptId: text(order.paymentAttemptId) || text(payment.attemptId),
    createdAt: text(order.createdAt),
    expiresAt: text(order.expiresAt) || null,
    refundObligationVnd: whole(asRaw(order.refundObligation).amountVnd),
  }
}

export function toOrderSummary(raw: unknown): OrderSummary {
  const order = asRaw(raw)
  return {
    orderId: text(order.orderId),
    status: orderStatus(order.status),
    paymentStatus: paymentStatus(order.paymentStatus),
    failureCode: text(order.failureCode) || null,
    totalPayableVnd: whole(order.totalPayableVnd),
    createdAt: text(order.createdAt),
    itemCount: whole(order.itemCount),
  }
}

function toOrderLine(raw: unknown): OrderLine {
  const line = asRaw(raw)
  const quantity = whole(line.quantity)
  const unitPriceVnd = whole(line.unitPriceVnd)
  const lineSubtotalVnd = whole(line.lineSubtotalVnd ?? unitPriceVnd * quantity)
  const lineDiscountVnd = whole(line.lineDiscountVnd)
  return {
    skuId: text(line.skuId),
    skuName: text(line.skuName) || text(line.skuId),
    imageUrl: text(line.imageUrl) || null,
    quantity,
    unitPriceVnd,
    lineSubtotalVnd,
    lineDiscountVnd,
    lineNetPayableVnd: whole(line.lineNetPayableVnd ?? lineSubtotalVnd - lineDiscountVnd),
    allocatedUnitPaidVnd: whole(line.allocatedUnitPaidVnd),
  }
}

function toOrderAddress(raw: unknown): OrderAddress | null {
  if (raw === null || typeof raw !== 'object') return null
  const address = asRaw(raw)
  return {
    recipient: text(address.recipient),
    phone: text(address.phone),
    line1: text(address.line1),
    ward: text(address.ward),
    district: text(address.district),
    province: text(address.province),
  }
}

export function toOrderDetail(raw: unknown): OrderDetail {
  const order = asRaw(raw)
  return {
    ...toOrder(raw),
    subtotalVnd: whole(order.subtotalVnd),
    discountVnd: whole(order.discountVnd),
    shippingFeeVnd: whole(order.shippingFeeVnd),
    voucherCode: text(order.voucherCode) || null,
    address: toOrderAddress(order.shippingAddress),
    lines: (Array.isArray(order.items) ? order.items : []).map(toOrderLine),
  }
}

/** Staff see the masked recipient and phone and the district and province, flat on the order. */
function toShipTo(raw: unknown): StaffShipTo | null {
  const shipTo = asRaw(raw)
  if (!shipTo.recipient && !shipTo.phone && !shipTo.district && !shipTo.province) return null
  return {
    recipient: text(shipTo.recipient),
    phone: text(shipTo.phone),
    district: text(shipTo.district),
    province: text(shipTo.province),
  }
}

export function toStaffOrderRow(raw: unknown): StaffOrderRow {
  const order = asRaw(raw)
  return {
    ...toOrderSummary(raw),
    customerId: text(order.customerId),
    warehouseId: text(order.warehouseId),
    shipTo: toShipTo(raw),
  }
}

export function toStaffOrderDetail(raw: unknown): StaffOrderDetail {
  const { address: _address, ...detail } = toOrderDetail(raw)
  const order = asRaw(raw)
  return {
    ...detail,
    customerId: text(order.customerId),
    warehouseId: text(order.warehouseId),
    shipTo: toShipTo(raw),
  }
}
