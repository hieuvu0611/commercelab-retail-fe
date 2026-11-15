import { storefrontApi } from '@/services/api/clients'
import type { Order, SimulatorOutcome } from '@/types/order'
import { toOrder } from './adapters'

// Place order (P5-T04), read an order (P5-T09) and the payment simulator (P5-T05). Calls skip the global 401
// sign-out so the pages can explain a refusal.
const quiet = { skipUnauthorizedHandler: true } as const

export const orderKey = (orderId: string) => ['order', orderId] as const

/** Places one order from an accepted quote. The same key always returns the same order. */
export async function placeOrder(quoteId: string, idempotencyKey: string): Promise<Order> {
  const { data } = await storefrontApi.post<unknown>(
    '/orders',
    { quoteId },
    { ...quiet, headers: { 'Idempotency-Key': idempotencyKey } }
  )
  return toOrder(data)
}

export async function getOrder(orderId: string): Promise<Order> {
  const { data } = await storefrontApi.get<unknown>(`/orders/${encodeURIComponent(orderId)}`, quiet)
  return toOrder(data)
}

/** Payment simulator (development): reports what the gateway would tell us. Returns the order as it is afterwards. */
export async function reportPaymentOutcome(
  attemptId: string,
  outcome: SimulatorOutcome
): Promise<Order> {
  const { data } = await storefrontApi.post<unknown>(
    `/payments/simulator/${encodeURIComponent(attemptId)}/outcome`,
    { outcome },
    quiet
  )
  return toOrder(data)
}
