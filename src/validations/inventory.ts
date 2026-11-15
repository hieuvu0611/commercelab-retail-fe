import { z } from 'zod'

// Mirrors the inventory service rules for opening stock; the server stays the authority.
const MIN_QTY = 1
const MAX_QTY = 1_000_000
const MIN_REASON = 3
const MAX_REASON = 500
const QTY_MESSAGE = 'Quantity must be a whole number from 1 to 1,000,000'

/** Whole units typed as 1500 or with thousands separators (1.500, 1,500); anything else becomes NaN. */
export function parseQuantity(text: string): number {
  const value = text.trim()
  return /^\d+$/.test(value) || /^\d{1,3}([.,]\d{3})+$/.test(value)
    ? Number(value.replace(/[.,]/g, ''))
    : Number.NaN
}

export const OpeningStockFormSchema = z.object({
  skuId: z.string().trim().min(1, 'Enter a SKU'),
  warehouseId: z.string().min(1, 'Choose a warehouse'),
  qty: z
    .string()
    .transform(parseQuantity)
    .refine(
      (value) => Number.isInteger(value) && value >= MIN_QTY && value <= MAX_QTY,
      QTY_MESSAGE
    ),
  reason: z
    .string()
    .trim()
    .min(MIN_REASON, 'Give a reason of at least 3 characters')
    .max(MAX_REASON, 'The reason must be at most 500 characters'),
})

export type OpeningStockFormValues = z.infer<typeof OpeningStockFormSchema>
