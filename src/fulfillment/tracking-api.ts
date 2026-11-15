import { storefrontApi } from '@/services/api/clients'
import { ApiError } from '@/services/api/api-error'
import type { OrderTracking } from '@/types/fulfillment'
import { toOrderTracking } from './adapters'

export const trackingKey = (orderId: string) => ['order-tracking', orderId] as const

/**
 * The customer's tracking timeline for one order (P6-T06). Null while no shipment exists yet (the service answers 404),
 * so the page can say the order is being prepared instead of showing an error.
 */
export async function getOrderTracking(orderId: string): Promise<OrderTracking | null> {
  try {
    const { data } = await storefrontApi.get<unknown>(
      `/orders/${encodeURIComponent(orderId)}/tracking`,
      { skipUnauthorizedHandler: true }
    )
    return toOrderTracking(data)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
