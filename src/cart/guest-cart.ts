import { z } from 'zod'
import type { Cart, GuestCartLine } from '@/types/cart'
import { MAX_QUANTITY, MIN_QUANTITY } from '@/types/cart'
import { clampQuantity } from './quantity'

/** The guest cart lives in localStorage until sign-in, when it is merged into the account cart. */
export const GUEST_CART_KEY = 'commercelab.guest-cart.v1'

const lineSchema = z.object({
  skuId: z.string().min(1),
  quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY),
  name: z.string(),
  slug: z.string(),
  imageUrl: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
  unitPriceVnd: z.number().int().min(0),
})

const getStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Reads the stored lines; unreadable or tampered entries are dropped instead of breaking the page. */
export function readGuestCart(storage: Storage | null = getStorage()): GuestCartLine[] {
  if (!storage) return []
  try {
    const raw: unknown = JSON.parse(storage.getItem(GUEST_CART_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((entry) => {
      const parsed = lineSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

export function writeGuestCart(
  lines: readonly GuestCartLine[],
  storage: Storage | null = getStorage()
): void {
  if (!storage) return
  try {
    if (lines.length === 0) storage.removeItem(GUEST_CART_KEY)
    else storage.setItem(GUEST_CART_KEY, JSON.stringify(lines))
  } catch {
    // Storage is full or blocked: the cart then only lasts for this page view.
  }
}

/** Adds a line, or raises the quantity of the existing line for the same SKU (capped at 99). */
export function addGuestLine(
  lines: readonly GuestCartLine[],
  line: GuestCartLine
): GuestCartLine[] {
  const existing = lines.find((entry) => entry.skuId === line.skuId)
  if (!existing) return [...lines, { ...line, quantity: clampQuantity(line.quantity) }]
  return lines.map((entry) =>
    entry.skuId === line.skuId
      ? { ...line, quantity: clampQuantity(entry.quantity + line.quantity) }
      : entry
  )
}

export const setGuestQuantity = (
  lines: readonly GuestCartLine[],
  skuId: string,
  quantity: number
): GuestCartLine[] =>
  lines.map((entry) =>
    entry.skuId === skuId ? { ...entry, quantity: clampQuantity(quantity) } : entry
  )

export const removeGuestLine = (lines: readonly GuestCartLine[], skuId: string): GuestCartLine[] =>
  lines.filter((entry) => entry.skuId !== skuId)

/** The guest cart in the shape of an account cart; prices are the snapshots taken when the items were added. */
export function guestToCart(lines: readonly GuestCartLine[]): Cart {
  const cartLines = lines.map((line) => ({
    ...line,
    lineTotalVnd: line.unitPriceVnd * line.quantity,
    isAvailable: true,
  }))
  return {
    lines: cartLines,
    subtotalVnd: cartLines.reduce((sum, line) => sum + line.lineTotalVnd, 0),
    itemCount: cartLines.reduce((sum, line) => sum + line.quantity, 0),
  }
}
