'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { WAREHOUSES } from '@/configs/roles'
import {
  POS_CATALOG_KEY,
  POS_SALES_KEY,
  PosApiError,
  createPosSale,
  listPosSales,
  searchPosCatalog,
} from '@/pos/pos-api'
import {
  POS_ROLES,
  type PosCatalogItem,
  type PosPaymentMethod,
  type PosSaleReceipt,
} from '@/pos/types'
import { StaffOnly } from './staff-only'

interface CartLine {
  skuId: string
  name: string
  unitPriceVnd: number
  quantity: number
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pos-${crypto.randomUUID()}`
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function resolveAllowedWarehouses(scopes: readonly string[]): string[] {
  if (scopes.length === 0 || scopes.includes('*') || scopes.includes('ALL')) {
    return [...WAREHOUSES]
  }
  const matched = WAREHOUSES.filter((id) => scopes.includes(id))
  return matched.length > 0 ? matched : [...WAREHOUSES]
}

function paymentLabel(method: PosPaymentMethod): string {
  return method === 'POS_CASH' ? 'Cash (POS_CASH)' : 'Card terminal (POS_CARD)'
}

function formatCheckoutError(error: unknown): string {
  if (error instanceof PosApiError) {
    return `${error.code}: ${error.message}`
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Could not complete the POS sale. Please try again.'
}

export function PosTerminalAdmin() {
  return (
    <StaffOnly role={POS_ROLES} what="use the counter POS terminal">
      <PosTerminalWorkspace />
    </StaffOnly>
  )
}

function PosTerminalWorkspace() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const allowedWarehouses = resolveAllowedWarehouses(session?.user?.warehouseScopes ?? [])
  const isWarehouseLocked = allowedWarehouses.length === 1

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(allowedWarehouses[0])
  const effectiveWarehouse = isWarehouseLocked
    ? allowedWarehouses[0]
    : allowedWarehouses.includes(selectedWarehouse)
      ? selectedWarehouse
      : allowedWarehouses[0]

  const [catalogQuery, setCatalogQuery] = useState('')
  const [manualSku, setManualSku] = useState('')
  const [manualQty, setManualQty] = useState('1')
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('POS_CASH')
  const [cashTenderedInput, setCashTenderedInput] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey())
  const [receipt, setReceipt] = useState<PosSaleReceipt | null>(null)
  const [checkoutError, setCheckoutError] = useState<string>()

  const catalog = useQuery({
    queryKey: POS_CATALOG_KEY(catalogQuery),
    queryFn: () => searchPosCatalog(catalogQuery, accessToken),
  })

  const recentSales = useQuery({
    queryKey: POS_SALES_KEY(effectiveWarehouse),
    queryFn: () => listPosSales(effectiveWarehouse, accessToken),
  })

  const refreshDraftKey = () => {
    setIdempotencyKey(generateIdempotencyKey())
    setCheckoutError(undefined)
  }

  const addItemToCart = (item: { skuId: string; name: string; unitPriceVnd: number }, qty = 1) => {
    const normalizedSku = item.skuId.trim()
    if (!normalizedSku || qty < 1) return
    setCart((current) => {
      const index = current.findIndex((line) => line.skuId === normalizedSku)
      if (index === -1) {
        return [
          ...current,
          {
            skuId: normalizedSku,
            name: item.name,
            unitPriceVnd: item.unitPriceVnd,
            quantity: qty,
          },
        ]
      }
      return current.map((line, idx) =>
        idx === index ? { ...line, quantity: line.quantity + qty } : line
      )
    })
    refreshDraftKey()
  }

  const updateLineQuantity = (skuId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) =>
          line.skuId === skuId ? { ...line, quantity: line.quantity + delta } : line
        )
        .filter((line) => line.quantity > 0)
    )
    refreshDraftKey()
  }

  const removeLine = (skuId: string) => {
    setCart((current) => current.filter((line) => line.skuId !== skuId))
    refreshDraftKey()
  }

  const handleManualAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const sku = manualSku.trim()
    if (!sku) return
    const parsedQty = Number.parseInt(manualQty, 10)
    const quantity = Number.isFinite(parsedQty) && parsedQty >= 1 ? parsedQty : 1
    const matched = catalog.data?.find(
      (entry) => entry.skuId.toLowerCase() === sku.toLowerCase()
    )
    addItemToCart(
      matched
        ? { skuId: matched.skuId, name: matched.name, unitPriceVnd: matched.unitPriceVnd }
        : { skuId: sku, name: sku, unitPriceVnd: 0 },
      quantity
    )
    setManualSku('')
    setManualQty('1')
  }

  const subtotalVnd = cart.reduce((sum, line) => sum + line.unitPriceVnd * line.quantity, 0)
  const totalVnd = subtotalVnd

  const trimmedCash = cashTenderedInput.trim()
  const parsedCashVnd = trimmedCash.length > 0 ? Number(trimmedCash) : undefined
  const isCashValidNumber =
    parsedCashVnd === undefined || (Number.isFinite(parsedCashVnd) && parsedCashVnd >= 0)
  const isCashInsufficient =
    paymentMethod === 'POS_CASH' &&
    parsedCashVnd !== undefined &&
    Number.isFinite(parsedCashVnd) &&
    parsedCashVnd < totalVnd
  const changeDueVnd =
    paymentMethod === 'POS_CASH' &&
    parsedCashVnd !== undefined &&
    Number.isFinite(parsedCashVnd) &&
    parsedCashVnd >= totalVnd
      ? parsedCashVnd - totalVnd
      : null

  const submitSale = useMutation({
    mutationFn: () =>
      createPosSale(
        {
          warehouseId: effectiveWarehouse,
          paymentMethod,
          ...(customerNote.trim() && { customerNote: customerNote.trim() }),
          ...(paymentMethod === 'POS_CASH' &&
            parsedCashVnd !== undefined &&
            Number.isFinite(parsedCashVnd) &&
            parsedCashVnd > 0 && { cashReceivedVnd: parsedCashVnd }),
          items: cart.map((line) => ({ skuId: line.skuId, quantity: line.quantity })),
        },
        idempotencyKey,
        accessToken
      ),
    onSuccess: (createdReceipt) => {
      setReceipt(createdReceipt)
      setCheckoutError(undefined)
      setCart([])
      setCashTenderedInput('')
      setCustomerNote('')
      setIdempotencyKey(generateIdempotencyKey())
      void queryClient.invalidateQueries({ queryKey: ['pos-sales'] })
      void queryClient.invalidateQueries({ queryKey: ['pos-catalog'] })
    },
    onError: (error) => {
      setCheckoutError(formatCheckoutError(error))
    },
  })

  const handleStartNewSale = () => {
    setReceipt(null)
    setCart([])
    setCashTenderedInput('')
    setCustomerNote('')
    setCheckoutError(undefined)
    setIdempotencyKey(generateIdempotencyKey())
  }

  const canCompleteSale =
    cart.length > 0 && !submitSale.isPending && isCashValidNumber && !isCashInsufficient

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4 border-b border-rule pb-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pos-warehouse" className="font-label text-sm text-ink">
            Store / Warehouse
          </label>
          <select
            id="pos-warehouse"
            value={effectiveWarehouse}
            disabled={isWarehouseLocked}
            onChange={(event) => {
              setSelectedWarehouse(event.target.value)
              refreshDraftKey()
            }}
            className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {WAREHOUSES.map((warehouseId) => (
              <option
                key={warehouseId}
                value={warehouseId}
                disabled={!allowedWarehouses.includes(warehouseId)}
              >
                {warehouseId}
              </option>
            ))}
          </select>
        </div>
        {isWarehouseLocked && (
          <p className="pb-3 text-sm text-ink-2">
            Locked to assigned store {effectiveWarehouse}.
          </p>
        )}
      </div>

      {receipt && (
        <section
          aria-labelledby="pos-receipt-heading"
          className="border border-rule-2 bg-paper-2 p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-label text-xs uppercase tracking-wide text-muted">
                POS Sale Recorded
              </p>
              <h2 id="pos-receipt-heading" className="mt-1 text-2xl text-ink">
                Receipt {receipt.receiptNumber}
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Order {receipt.orderId} · Store {receipt.warehouseId} ·{' '}
                {paymentLabel(receipt.paymentMethod)}
              </p>
            </div>
            <button type="button" onClick={handleStartNewSale} className="btn btn-primary">
              Start new sale
            </button>
          </div>

          <ul
            aria-label="Receipt items"
            className="mt-4 divide-y divide-rule border-y border-rule text-sm"
          >
            {receipt.items.map((item) => (
              <li key={item.skuId} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-label text-ink">{item.name}</p>
                  <p className="text-muted">
                    {item.skuId} · {item.quantity} × {formatVnd(item.unitPriceVnd)}
                  </p>
                </div>
                <span className="font-label text-ink">{formatVnd(item.lineTotalVnd)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 flex max-w-[24rem] flex-col gap-1 text-sm">
            <div className="font-label flex justify-between text-base text-ink">
              <dt>Total paid</dt>
              <dd>{formatVnd(receipt.totalVnd)}</dd>
            </div>
            {receipt.paymentMethod === 'POS_CASH' && receipt.cashReceivedVnd !== undefined && (
              <>
                <div className="flex justify-between text-ink-2">
                  <dt>Cash received</dt>
                  <dd>{formatVnd(receipt.cashReceivedVnd)}</dd>
                </div>
                <div className="flex justify-between text-ink-2">
                  <dt>Change due</dt>
                  <dd>{formatVnd(receipt.changeDueVnd ?? 0)}</dd>
                </div>
              </>
            )}
          </dl>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <section aria-labelledby="pos-catalog-heading" className="flex flex-col gap-5">
          <h2 id="pos-catalog-heading" className="font-label text-lg text-ink">
            SKU Lookup &amp; Quick Add
          </h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pos-catalog-search" className="font-label text-sm text-ink">
              Search catalog
            </label>
            <input
              id="pos-catalog-search"
              type="search"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search by SKU or product name"
              className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink placeholder:text-muted"
            />
          </div>

          <form onSubmit={handleManualAdd} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
              <label htmlFor="pos-manual-sku" className="font-label text-sm text-ink">
                Manual SKU
              </label>
              <input
                id="pos-manual-sku"
                type="text"
                value={manualSku}
                onChange={(event) => setManualSku(event.target.value)}
                placeholder="e.g. BP-CITY-BLK-20L"
                className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink placeholder:text-muted"
              />
            </div>
            <div className="flex w-20 flex-col gap-1.5">
              <label htmlFor="pos-manual-qty" className="font-label text-sm text-ink">
                Qty
              </label>
              <input
                id="pos-manual-qty"
                type="number"
                min={1}
                value={manualQty}
                onChange={(event) => setManualQty(event.target.value)}
                className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink"
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Add SKU
            </button>
          </form>

          {catalog.isError ? (
            <FormAlert message="Could not load catalog items. You can still enter a SKU manually." />
          ) : !catalog.data ? (
            <p role="status" className="text-sm text-ink-2">
              Loading catalog…
            </p>
          ) : catalog.data.length === 0 ? (
            <p className="text-sm text-ink-2">No catalog items match your search.</p>
          ) : (
            <ul
              aria-label="Quick-add catalog"
              className="divide-y divide-rule border-y border-rule"
            >
              {catalog.data.map((item: PosCatalogItem) => {
                const stock = item.availableByWarehouse?.[effectiveWarehouse]
                return (
                  <li
                    key={item.skuId}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-label text-ink">{item.name}</p>
                      <p className="text-muted">
                        {item.skuId} · {formatVnd(item.unitPriceVnd)}
                        {stock !== undefined ? ` · ${stock} in stock` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItemToCart(item, 1)}
                      className="btn btn-secondary"
                    >
                      Add {item.skuId}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="pos-cart-heading"
          className="flex flex-col gap-5 border border-rule bg-paper-2 p-5"
        >
          <h2 id="pos-cart-heading" className="font-label text-lg text-ink">
            Counter Cart
          </h2>

          {cart.length === 0 ? (
            <p className="text-sm text-ink-2">Add SKUs to start a counter sale.</p>
          ) : (
            <ul aria-label="Counter cart items" className="divide-y divide-rule border-y border-rule">
              {cart.map((line) => (
                <li
                  key={line.skuId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-label text-ink">{line.name}</p>
                    <p className="text-muted">
                      {line.skuId} · {formatVnd(line.unitPriceVnd)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${line.skuId}`}
                      onClick={() => updateLineQuantity(line.skuId, -1)}
                      className="btn btn-secondary px-2.5"
                    >
                      -
                    </button>
                    <span className="min-w-[1.75rem] text-center font-label text-ink">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${line.skuId}`}
                      onClick={() => updateLineQuantity(line.skuId, 1)}
                      className="btn btn-secondary px-2.5"
                    >
                      +
                    </button>
                    <span className="min-w-[5.5rem] text-right font-label text-ink">
                      {formatVnd(line.unitPriceVnd * line.quantity)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${line.skuId}`}
                      onClick={() => removeLine(line.skuId)}
                      className="text-xs text-muted underline hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-ink-2">
              <dt>Subtotal</dt>
              <dd>{formatVnd(subtotalVnd)}</dd>
            </div>
            <div className="flex justify-between text-ink-2">
              <dt>Shipping</dt>
              <dd>Free</dd>
            </div>
            <div className="font-label mt-1 flex justify-between border-t border-rule-2 pt-2 text-lg text-ink">
              <dt>Total</dt>
              <dd>{formatVnd(totalVnd)}</dd>
            </div>
          </dl>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-label text-sm text-ink">Payment method</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-control border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink">
                <input
                  type="radio"
                  name="pos-payment-method"
                  value="POS_CASH"
                  checked={paymentMethod === 'POS_CASH'}
                  onChange={() => {
                    setPaymentMethod('POS_CASH')
                    refreshDraftKey()
                  }}
                />
                <span>Cash</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-control border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink">
                <input
                  type="radio"
                  name="pos-payment-method"
                  value="POS_CARD"
                  checked={paymentMethod === 'POS_CARD'}
                  onChange={() => {
                    setPaymentMethod('POS_CARD')
                    refreshDraftKey()
                  }}
                />
                <span>Card terminal</span>
              </label>
            </div>
          </fieldset>

          {paymentMethod === 'POS_CASH' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pos-cash-received" className="font-label text-sm text-ink">
                Cash received (VND)
              </label>
              <input
                id="pos-cash-received"
                type="number"
                min={0}
                step={1000}
                value={cashTenderedInput}
                onChange={(event) => {
                  setCashTenderedInput(event.target.value)
                  refreshDraftKey()
                }}
                placeholder="Optional tendered cash"
                className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink placeholder:text-muted"
              />
              {isCashInsufficient && (
                <p role="alert" className="text-sm text-error">
                  Cash received is less than total due ({formatVnd(totalVnd)}).
                </p>
              )}
              {changeDueVnd !== null && cart.length > 0 && (
                <p className="text-sm text-ink-2">
                  Change due: <strong className="text-ink">{formatVnd(changeDueVnd)}</strong>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pos-customer-note" className="font-label text-sm text-ink">
              Customer note (optional)
            </label>
            <input
              id="pos-customer-note"
              type="text"
              value={customerNote}
              onChange={(event) => {
                setCustomerNote(event.target.value)
                refreshDraftKey()
              }}
              placeholder="Walk-in counter receipt"
              className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink placeholder:text-muted"
            />
          </div>

          <FormAlert message={checkoutError} />

          <button
            type="button"
            disabled={!canCompleteSale}
            onClick={() => submitSale.mutate()}
            className="btn btn-primary w-full"
          >
            {submitSale.isPending ? 'Recording sale…' : 'Complete sale'}
          </button>
        </section>
      </div>

      <section aria-labelledby="pos-recent-sales-heading">
        <h2 id="pos-recent-sales-heading" className="font-label text-lg text-ink">
          Recent POS Sales ({effectiveWarehouse})
        </h2>
        <div className="relative mt-4 overflow-x-auto">
          {recentSales.isError ? (
            <FormAlert message="Could not load recent POS sales." />
          ) : !recentSales.data ? (
            <p role="status" className="text-sm text-ink-2">
              Loading recent sales…
            </p>
          ) : recentSales.data.length === 0 ? (
            <p className="text-sm text-ink-2">No POS sales recorded for {effectiveWarehouse}.</p>
          ) : (
            <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
              <caption className="sr-only">Recent POS sales</caption>
              <thead>
                <tr className="border-b border-rule-2 text-ink">
                  {['Receipt', 'Order', 'Store', 'Payment', 'Items', 'Total', 'Recorded'].map(
                    (heading) => (
                      <th key={heading} scope="col" className="font-label py-3 pr-4">
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {recentSales.data.map((sale) => (
                  <tr key={sale.orderId} className="border-b border-rule align-top">
                    <th scope="row" className="py-3 pr-4 font-normal text-ink">
                      {sale.receiptNumber}
                    </th>
                    <td className="py-3 pr-4 text-ink-2">{sale.orderId}</td>
                    <td className="py-3 pr-4">{sale.warehouseId}</td>
                    <td className="py-3 pr-4">{paymentLabel(sale.paymentMethod)}</td>
                    <td className="py-3 pr-4">{sale.itemCount}</td>
                    <td className="py-3 pr-4">{formatVnd(sale.totalVnd)}</td>
                    <td className="py-3 pr-4">{dateFormat.format(new Date(sale.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
