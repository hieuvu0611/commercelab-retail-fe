// Cart, address, voucher and quote API types (Phase 4). Everything the screens know about these contracts lives
// here, and src/cart/adapters.ts maps the raw responses onto it, so the real services (P4-T10) are reconciled in
// two places. Amounts are integer VND and include VAT; the pricing service quotes the prices it holds.

export const MIN_QUANTITY = 1
export const MAX_QUANTITY = 99

/** One line of a cart as the screens show it. */
export interface CartLine {
  skuId: string
  quantity: number
  name: string
  slug: string | null
  imageUrl: string | null
  /** Variant values, for example { color: "Black" }. */
  attributes: Record<string, string>
  unitPriceVnd: number
  lineTotalVnd: number
  /** False when the SKU is no longer published or active; such a line cannot be ordered. */
  isAvailable: boolean
}

export interface Cart {
  lines: CartLine[]
  subtotalVnd: number
  /** Total number of units across lines. */
  itemCount: number
}

/** A line of the guest cart kept in the browser; the price is a snapshot, confirmed again at checkout. */
export interface GuestCartLine {
  skuId: string
  quantity: number
  name: string
  slug: string
  imageUrl: string | null
  attributes: Record<string, string>
  unitPriceVnd: number
}

export interface CartMergeResult {
  /** Lines of the guest cart the server did not take (unpublished, inactive or unknown SKU). */
  skipped: Array<{ skuId: string; reason: string }>
}
