'use client'

import type { ProductListParams } from '@/types/catalog'

interface ProductFiltersProps {
  state: ProductListParams
  /** Facet options per variant axis, from the unfiltered result set. */
  facets: Record<string, string[]>
  onChange: (next: ProductListParams) => void
  onClear: () => void
}

const inputClass =
  'h-11 w-full min-w-0 border border-rule-2 bg-paper px-3 text-ink focus-visible:border-ink'

export function ProductFilters({ state, facets, onChange, onClear }: ProductFiltersProps) {
  function toggle(axis: string, value: string) {
    const current = state.attrs?.[axis] ?? []
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]
    onChange({ ...state, attrs: { ...state.attrs, [axis]: next }, page: 1 })
  }

  function applyPrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (name: string) => {
      const value = Number(String(form.get(name) ?? '').replace(/\D/g, ''))
      return value > 0 ? value : undefined
    }
    const { minPrice: _min, maxPrice: _max, ...rest } = state
    const minPrice = read('minPrice')
    const maxPrice = read('maxPrice')
    onChange({
      ...rest,
      ...(minPrice && { minPrice }),
      ...(maxPrice && { maxPrice }),
      page: 1,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={applyPrice}
        key={`${state.minPrice ?? ''}-${state.maxPrice ?? ''}`}
        className="flex flex-col gap-2"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="font-label mb-2 text-ink">Price (VND, incl. VAT)</legend>
          <label className="text-sm text-ink-2">
            <span className="sr-only">Minimum price</span>
            <input
              name="minPrice"
              inputMode="numeric"
              placeholder="From"
              defaultValue={state.minPrice ?? ''}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-ink-2">
            <span className="sr-only">Maximum price</span>
            <input
              name="maxPrice"
              inputMode="numeric"
              placeholder="To"
              defaultValue={state.maxPrice ?? ''}
              className={inputClass}
            />
          </label>
        </fieldset>
        <button type="submit" className="btn btn-secondary">
          Apply price
        </button>
      </form>

      {Object.entries(facets).map(([axis, values]) => (
        <fieldset key={axis}>
          <legend className="font-label mb-1 capitalize text-ink">{axis}</legend>
          {values.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={state.attrs?.[axis]?.includes(value) ?? false}
                onChange={() => toggle(axis, value)}
                className="size-4 accent-accent"
              />
              {value}
            </label>
          ))}
        </fieldset>
      ))}

      <button
        type="button"
        onClick={onClear}
        className="font-label min-h-11 text-left text-ink underline"
      >
        Clear all filters
      </button>
    </div>
  )
}
