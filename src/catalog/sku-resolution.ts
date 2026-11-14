import type { StorefrontSku, VariantSelection } from '@/types/catalog'

const orderable = (skus: StorefrontSku[]) => skus.filter((sku) => sku.isActive)

const matches = (sku: StorefrontSku, selection: VariantSelection) =>
  Object.entries(selection).every(([axis, value]) => sku.attributes[axis] === value)

/** The SKU for a complete selection (every axis has a value), or undefined. */
export function resolveSku(
  skus: StorefrontSku[],
  axes: string[],
  selection: VariantSelection
): StorefrontSku | undefined {
  if (axes.some((axis) => !selection[axis])) return undefined
  return orderable(skus).find((sku) => matches(sku, selection))
}

/** Whether choosing `value` on `axis` still leaves a SKU, given the other axes already chosen. */
export function isOptionAvailable(
  skus: StorefrontSku[],
  selection: VariantSelection,
  axis: string,
  value: string
): boolean {
  const { [axis]: _current, ...others } = selection
  return orderable(skus).some((sku) => sku.attributes[axis] === value && matches(sku, others))
}

/** Picks `value` on `axis`; when that combination does not exist, the other axes move to the first SKU that has it. */
export function selectOption(
  skus: StorefrontSku[],
  selection: VariantSelection,
  axis: string,
  value: string
): VariantSelection {
  const next = { ...selection, [axis]: value }
  if (orderable(skus).some((sku) => matches(sku, next))) return next
  const fallback = orderable(skus).find((sku) => sku.attributes[axis] === value)
  return fallback ? { ...fallback.attributes } : selection
}

/** The selection of the cheapest SKU, so the page opens on a real, priced variant. */
export function defaultSelection(skus: StorefrontSku[]): VariantSelection {
  const cheapest = [...orderable(skus)].sort((a, b) => a.unitPriceVnd - b.unitPriceVnd)[0]
  return cheapest ? { ...cheapest.attributes } : {}
}
