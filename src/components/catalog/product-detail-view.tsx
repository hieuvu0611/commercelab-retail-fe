'use client'

import { useState } from 'react'
import { AvailabilityBadge } from './availability-badge'
import { formatVnd, withVat } from '@/catalog/money'
import {
  defaultSelection,
  isOptionAvailable,
  resolveSku,
  selectOption,
} from '@/catalog/sku-resolution'
import type { ProductDetail } from '@/types/catalog'

const CART_NOTICE = 'Ordering opens soon. Nothing was added to your cart.'
const MIN_QUANTITY = 1
const MAX_QUANTITY = 99

export function ProductDetailView({ product }: { product: ProductDetail }) {
  const [selection, setSelection] = useState(() => defaultSelection(product.skus))
  const [imageIndex, setImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(MIN_QUANTITY)
  const [cartNotice, setCartNotice] = useState<string>()
  const sku = resolveSku(product.skus, product.variantAxes, selection)
  const image = product.images[imageIndex]
  const availability = sku?.availability ?? 'unknown'
  const isOut = availability === 'OUT'
  const clamp = (value: number) =>
    Math.min(Math.max(value || MIN_QUANTITY, MIN_QUANTITY), MAX_QUANTITY)

  const axisValues = (axis: string) => [
    ...new Set(product.skus.map((entry) => entry.attributes[axis])),
  ]

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <div>
        <div className="aspect-square bg-paper-2">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt ?? product.name}
              className="size-full object-cover"
            />
          )}
        </div>
        {product.images.length > 1 && (
          <ul aria-label="Product images" className="mt-3 flex gap-2">
            {product.images.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-label={`Show image ${index + 1}`}
                  aria-current={index === imageIndex}
                  onClick={() => setImageIndex(index)}
                  className="size-16 overflow-hidden border border-rule-2 aria-[current=true]:border-ink aria-[current=true]:border-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.url} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="font-label text-sm text-muted">{product.brand}</p>
        <h1 className="mt-1 text-3xl">{product.name}</h1>
        <p className="mt-3 max-w-[60ch] text-ink-2">{product.description}</p>

        <p className="font-label mt-6 text-2xl text-ink" aria-live="polite">
          {sku ? formatVnd(withVat(sku.unitPriceVnd)) : 'Choose a combination'}
          {sku && <span className="ml-2 text-sm font-normal text-muted">incl. VAT</span>}
        </p>
        <div className="mt-1" aria-live="polite">
          {availability === 'unknown' ? (
            <p className="text-sm text-muted">Availability is confirmed at checkout.</p>
          ) : (
            <AvailabilityBadge state={availability} />
          )}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          {product.variantAxes.map((axis) => (
            <div key={axis} role="radiogroup" aria-label={axis} className="flex flex-col gap-2">
              <p className="font-label text-sm capitalize text-ink">
                {axis}: <span className="font-normal text-ink-2">{selection[axis]}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {axisValues(axis).map((value) => {
                  const isSelected = selection[axis] === value
                  const isAvailable = isOptionAvailable(product.skus, selection, axis, value)
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!isAvailable}
                      onClick={() =>
                        setSelection(selectOption(product.skus, selection, axis, value))
                      }
                      className="font-label min-h-11 min-w-11 border border-rule-2 px-4 text-sm text-ink hover:border-ink disabled:cursor-not-allowed disabled:text-muted disabled:line-through disabled:opacity-50 aria-checked:border-2 aria-checked:border-ink"
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="quantity" className="font-label block text-sm text-ink">
              Quantity
            </label>
            <div className="mt-1 flex">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= MIN_QUANTITY}
                onClick={() => setQuantity(clamp(quantity - 1))}
                className="btn btn-secondary px-3"
              >
                −
              </button>
              <input
                id="quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) =>
                  setQuantity(clamp(Number(event.target.value.replace(/\D/g, ''))))
                }
                className="h-11 w-16 border-y border-ink bg-paper text-center text-ink"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => setQuantity(clamp(quantity + 1))}
                className="btn btn-secondary px-3"
              >
                +
              </button>
            </div>
          </div>
          {/* Wired to the cart in Phase 4; until then it only explains that ordering is not open. */}
          <button
            type="button"
            disabled={isOut}
            className="btn btn-primary"
            aria-describedby="cart-note"
            onClick={() => setCartNotice(CART_NOTICE)}
          >
            Add to cart
          </button>
        </div>
        <p id="cart-note" className="mt-2 text-sm text-muted">
          {isOut ? 'This variant is out of stock.' : 'Ordering opens soon.'}
        </p>
        {cartNotice && !isOut && (
          <p role="status" className="mt-2 text-sm text-ink">
            {cartNotice}
          </p>
        )}
        {sku && <p className="mt-4 text-sm text-muted">SKU {sku.skuId}</p>}

        <h2 className="mt-10 text-xl">Specifications</h2>
        <table className="mt-3 w-full max-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">Specifications</caption>
          <tbody>
            {Object.entries(product.specs).map(([name, value]) => (
              <tr key={name} className="border-b border-rule">
                <th scope="row" className="font-label w-1/3 py-2 pr-4 font-medium text-ink">
                  {name}
                </th>
                <td className="py-2 text-ink-2">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
