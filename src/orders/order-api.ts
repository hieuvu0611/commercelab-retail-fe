import { storefrontApi } from '@/services/api/clients'
import type { CancelReasonCode } from '@/types/cancellation'
import type { Order, OrderDetail, PaymentMethod, SimulatorOutcome } from '@/types/order'
import { toOrder, toOrderDetail, toOrderSummary } from './adapters'

// Place order (P5-T04), read an order (P5-T09) and the payment simulator (P5-T05). Calls skip the global 401
// sign-out so the pages can explain a refusal.
const quiet = { skipUnauthorizedHandler: true } as const

export const orderKey = (orderId: string) => ['order', orderId] as const
export const orderDetailKey = (orderId: string) => ['order-detail', orderId] as const
export const ORDERS_KEY = ['orders'] as const

/** Places one order from an accepted quote. The same key always returns the same order. */
export async function placeOrder(
  quoteId: string,
  idempotencyKey: string,
  paymentMethod?: PaymentMethod
): Promise<Order> {
  const { data } = await storefrontApi.post<unknown>(
    '/orders',
    { quoteId, ...(paymentMethod && { paymentMethod }) },
    { ...quiet, headers: { 'Idempotency-Key': idempotencyKey } }
  )
  return toOrder(data)
}

export async function getOrder(orderId: string): Promise<Order> {
  const { data } = await storefrontApi.get<unknown>(`/orders/${encodeURIComponent(orderId)}`, quiet)
  return toOrder(data)
}

/** The order with its frozen commercial snapshot (P5-T09). */
export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const { data } = await storefrontApi.get<unknown>(`/orders/${encodeURIComponent(orderId)}`, quiet)
  return toOrderDetail(data)
}

/**
 * Asks to cancel an order (P7-T01/T02). The answer is the order: CANCELLED, or CANCEL_REQUESTED while the warehouse
 * still has to stop the parcel. The same key always replays the same answer.
 */
export async function cancelOrder(
  orderId: string,
  reason: CancelReasonCode,
  idempotencyKey: string
): Promise<OrderDetail> {
  const { data } = await storefrontApi.post<unknown>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    { reason },
    { ...quiet, headers: { 'Idempotency-Key': idempotencyKey } }
  )
  return toOrderDetail(data)
}

/** The signed-in customer's orders, newest first. */
export async function listOrders(query: { page: number; limit: number }) {
  const { data, metadata } = await storefrontApi.get<unknown[]>('/orders', {
    ...quiet,
    params: query,
  })
  return {
    items: (data ?? []).map(toOrderSummary),
    total: metadata?.total ?? data?.length ?? 0,
    pageCount: metadata?.pageCount ?? 1,
  }
}

/**
 * Payment simulator (development): reports what the gateway would tell us. The service answers with the payment
 * attempt, so the order is read again to return what it looks like afterwards.
 */
export async function reportPaymentOutcome(
  attemptId: string,
  outcome: SimulatorOutcome
): Promise<Order> {
  const { data } = await storefrontApi.post<{ orderId?: string }>(
    `/payments/simulator/${encodeURIComponent(attemptId)}/outcome`,
    { outcome },
    quiet
  )
  return getOrder(data?.orderId ?? attemptId.replace(/^PAY-/, ''))
}

/** Confirms carrier cash collection for a COD order (Phase 12). */
export async function collectCODPayment(orderId: string, collectedAmount: number, eventId: string): Promise<void> {
  await storefrontApi.post<unknown>(
    `/payments/orders/${encodeURIComponent(orderId)}/cod-collect`,
    { collectedAmount, eventId },
    quiet
  )
}

/** Cancels a COD order upon delivery failure or customer rejection (Phase 12). */
export async function cancelCODPayment(orderId: string, reason?: string): Promise<void> {
  await storefrontApi.post<unknown>(
    `/payments/orders/${encodeURIComponent(orderId)}/cod-cancel`,
    { reason },
    quiet
  )
}
