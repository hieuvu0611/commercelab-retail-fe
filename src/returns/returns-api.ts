import { storefrontApi } from '@/services/api/clients'
import type { ReturnCase, ReturnRequestInput } from '@/types/returns'
import { toReturnCase } from './adapters'

// Customer return calls (P8-T02, as the service is assumed to answer). Calls skip the global 401 sign-out so the pages can
// explain a refusal.
const quiet = { skipUnauthorizedHandler: true } as const

export const returnKey = (returnId: string) => ['return', returnId] as const
export const orderReturnsKey = (orderId: string) => ['order-returns', orderId] as const

/** Asks to return units of a delivered order. The same key always returns the same case. */
export async function requestReturn(
  input: ReturnRequestInput,
  idempotencyKey: string
): Promise<ReturnCase> {
  const { data } = await storefrontApi.post<unknown>('/returns', input, {
    ...quiet,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  return toReturnCase(data)
}

export async function getReturn(returnId: string): Promise<ReturnCase> {
  const { data } = await storefrontApi.get<unknown>(
    `/returns/${encodeURIComponent(returnId)}`,
    quiet
  )
  return toReturnCase(data)
}

/** The signed-in customer's return cases of one order, newest first. */
export async function listOrderReturns(orderId: string): Promise<ReturnCase[]> {
  const { data } = await storefrontApi.get<unknown[]>('/returns', {
    ...quiet,
    params: { orderId },
  })
  return (data ?? []).map(toReturnCase)
}
