/** VAT added to catalogue prices when shown to customers (decision in docs/00: prices are stored without VAT). */
export const VAT_RATE = 0.1

export const withVat = (unitPriceVnd: number): number => Math.round(unitPriceVnd * (1 + VAT_RATE))

const vndFormat = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export const formatVnd = (amountVnd: number): string => vndFormat.format(amountVnd)

/** "330.000 ₫" for one price, "330.000 ₫ – 396.000 ₫" for a range, both including VAT. */
export function formatPriceRange(minVnd: number, maxVnd: number): string {
  const min = formatVnd(withVat(minVnd))
  return minVnd === maxVnd ? min : `${min} – ${formatVnd(withVat(maxVnd))}`
}

/** Customers filter by the VAT-inclusive prices they see; the API filters by unit price without VAT. */
export const priceFilterToApi = (inclVatVnd: number, bound: 'min' | 'max'): number =>
  bound === 'min' ? Math.ceil(inclVatVnd / (1 + VAT_RATE)) : Math.floor(inclVatVnd / (1 + VAT_RATE))
