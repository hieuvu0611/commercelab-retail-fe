const vndFormat = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export const formatVnd = (amountVnd: number): string => vndFormat.format(amountVnd)

/** "300.000 ₫" for one price, "300.000 ₫ – 360.000 ₫" for a range. Listed prices already include 10% VAT (docs/00 rule 3). */
export function formatPriceRange(minVnd: number, maxVnd: number): string {
  const min = formatVnd(minVnd)
  return minVnd === maxVnd ? min : `${min} – ${formatVnd(maxVnd)}`
}
