'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError } from '@/services/api/api-error'
import type { Cart, GuestCartLine } from '@/types/cart'
import { deleteCartItem, getCart, mergeGuestCart, putCartItem } from './cart-api'
import {
  GUEST_CART_KEY,
  addGuestLine,
  guestToCart,
  readGuestCart,
  removeGuestLine,
  setGuestQuantity,
  writeGuestCart,
} from './guest-cart'
import { clampQuantity } from './quantity'

const MERGE_LOCK = 'commercelab-guest-cart-merge'
const EMPTY_CART: Cart = { lines: [], subtotalVnd: 0, itemCount: 0 }

export interface CartContextValue {
  cart: Cart
  isSignedIn: boolean
  /** The account cart is still loading. */
  isLoading: boolean
  /** A message about the last failed cart action, or null. */
  error: string | null
  /** A message about the guest cart merge, or null. */
  notice: string | null
  dismissNotice: () => void
  /** Adds units of a SKU; resolves to false (and sets `error`) when it could not be added. */
  addItem: (line: GuestCartLine) => Promise<boolean>
  setQuantity: (skuId: string, quantity: number) => Promise<void>
  removeItem: (skuId: string) => Promise<void>
  isDrawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}

function failureMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    (error.code === 'SKU_NOT_FOUND' || error.code === 'SKU_NOT_ORDERABLE')
  )
    return 'This item is no longer available.'
  if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
    return Object.values(error.fieldErrors)[0]?.[0] ?? 'We could not update your cart.'
  return 'We could not update your cart. Please try again.'
}

/** Runs `task` under a cross-tab lock when the browser has one, so two tabs never merge the same guest cart. */
async function withMergeLock(task: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(MERGE_LOCK, task)
    return
  }
  await task()
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const isSignedIn =
    status === 'authenticated' && Boolean(session?.accessToken) && !session?.error && !!userId
  const [guestLines, setGuestLines] = useState<GuestCartLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const mergedFor = useRef<string | null>(null)

  const cartKey = useMemo(() => ['cart', userId] as const, [userId])
  const accountCart = useQuery({
    queryKey: cartKey,
    queryFn: getCart,
    enabled: isSignedIn,
    staleTime: 0,
  })

  // The guest cart is read after mount (the server render has no localStorage) and follows other tabs.
  useEffect(() => {
    setGuestLines(readGuestCart())
    const onStorage = (event: StorageEvent) => {
      if (event.key === GUEST_CART_KEY || event.key === null) setGuestLines(readGuestCart())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Signing in moves the guest lines into the account cart once; the browser copy goes only after the server took it.
  useEffect(() => {
    if (!isSignedIn || !userId || mergedFor.current === userId) return
    if (readGuestCart().length === 0) return
    mergedFor.current = userId
    void withMergeLock(async () => {
      const lines = readGuestCart()
      if (lines.length === 0) return
      try {
        const { skipped } = await mergeGuestCart(lines)
        writeGuestCart([])
        setGuestLines([])
        setNotice(
          skipped.length > 0
            ? `${skipped.length} item${skipped.length === 1 ? '' : 's'} from your earlier cart ${
                skipped.length === 1 ? 'is' : 'are'
              } no longer available and was left out.`
            : 'The items you added before signing in are now in your cart.'
        )
        await queryClient.invalidateQueries({ queryKey: ['cart'] })
      } catch {
        setNotice(
          'We could not move the items you added before signing in. They are still saved on this device.'
        )
      }
    })
  }, [isSignedIn, userId, queryClient])

  const cart = useMemo(
    () => (isSignedIn ? (accountCart.data ?? EMPTY_CART) : guestToCart(guestLines)),
    [isSignedIn, accountCart.data, guestLines]
  )

  const changeGuest = useCallback((next: GuestCartLine[]) => {
    writeGuestCart(next)
    setGuestLines(next)
  }, [])

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: cartKey }),
    [queryClient, cartKey]
  )

  const addItem = useCallback(
    async (line: GuestCartLine) => {
      setError(null)
      if (!isSignedIn) {
        changeGuest(addGuestLine(readGuestCart(), line))
        return true
      }
      try {
        const current = cart.lines.find((entry) => entry.skuId === line.skuId)?.quantity ?? 0
        await putCartItem(line.skuId, clampQuantity(current + line.quantity))
        await refresh()
        return true
      } catch (caught) {
        setError(failureMessage(caught))
        return false
      }
    },
    [isSignedIn, cart.lines, changeGuest, refresh]
  )

  const setQuantity = useCallback(
    async (skuId: string, quantity: number) => {
      setError(null)
      const next = clampQuantity(quantity)
      if (!isSignedIn) return changeGuest(setGuestQuantity(readGuestCart(), skuId, next))
      try {
        await putCartItem(skuId, next)
        await refresh()
      } catch (caught) {
        setError(failureMessage(caught))
      }
    },
    [isSignedIn, changeGuest, refresh]
  )

  const removeItem = useCallback(
    async (skuId: string) => {
      setError(null)
      if (!isSignedIn) return changeGuest(removeGuestLine(readGuestCart(), skuId))
      try {
        await deleteCartItem(skuId)
        await refresh()
      } catch (caught) {
        setError(failureMessage(caught))
      }
    },
    [isSignedIn, changeGuest, refresh]
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isSignedIn,
      isLoading: isSignedIn && accountCart.isPending,
      error: error ?? (accountCart.isError ? 'We could not load your cart. Please reload.' : null),
      notice,
      dismissNotice: () => setNotice(null),
      addItem,
      setQuantity,
      removeItem,
      isDrawerOpen,
      openDrawer: () => setIsDrawerOpen(true),
      closeDrawer: () => setIsDrawerOpen(false),
    }),
    [
      cart,
      isSignedIn,
      accountCart.isPending,
      accountCart.isError,
      error,
      notice,
      addItem,
      setQuantity,
      removeItem,
      isDrawerOpen,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
