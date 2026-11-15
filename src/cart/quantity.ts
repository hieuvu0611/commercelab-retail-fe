import { MAX_QUANTITY, MIN_QUANTITY } from '@/types/cart'

/** Quantities are whole numbers from 1 to 99 (P4-T01). */
export const clampQuantity = (value: number): number =>
  Math.min(Math.max(Math.trunc(value) || MIN_QUANTITY, MIN_QUANTITY), MAX_QUANTITY)
