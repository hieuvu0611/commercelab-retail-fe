import { storefrontApi } from '@/services/api/clients'
import type { Cart, CartMergeResult, GuestCartLine } from '@/types/cart'
import { toCart, toMergeResult } from './adapters'

// Customer cart calls (P4-T01). Mutations skip the global 401 sign-out so the screen can show the error.
const quiet = { skipUnauthorizedHandler: true } as const

const itemPath = (skuId: string) => `/carts/me/items/${encodeURIComponent(skuId)}`

export const getCart = async (): Promise<Cart> =>
  toCart((await storefrontApi.get('/carts/me')).data)

export const putCartItem = (skuId: string, quantity: number) =>
  storefrontApi.put<unknown>(itemPath(skuId), { quantity }, quiet)

export const deleteCartItem = (skuId: string) =>
  storefrontApi.delete<unknown>(itemPath(skuId), quiet)

/** Moves the guest lines into the account cart; the server sums quantities of SKUs already in it. */
export async function mergeGuestCart(lines: readonly GuestCartLine[]): Promise<CartMergeResult> {
  const { data } = await storefrontApi.post<unknown>(
    '/carts/me/merge',
    { lines: lines.map(({ skuId, quantity }) => ({ skuId, quantity })) },
    quiet
  )
  return toMergeResult(data)
}
