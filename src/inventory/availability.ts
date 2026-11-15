import { LOW_STOCK_THRESHOLD, type Availability, type StockState } from '@/types/inventory'

/** Customer wording for a stock state; "unknown" has no wording (the page simply says nothing). */
export function availabilityLabel(state: Availability): string | null {
  switch (state) {
    case 'IN_STOCK':
      return 'In stock'
    case 'LOW':
      return 'Low stock'
    case 'OUT':
      return 'Out of stock'
    default:
      return null
  }
}

/** The state of a SKU with `available` units for sale. */
export function stateFromAvailable(available: number): StockState {
  if (available <= 0) return 'OUT'
  return available <= LOW_STOCK_THRESHOLD ? 'LOW' : 'IN_STOCK'
}
