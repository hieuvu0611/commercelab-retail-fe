'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getPriceHistory, listSkuPrices, setSkuPrice } from '@/catalog/admin-prices-api'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import type { SkuPriceRow } from '@/types/catalog'
import { AdminPanel } from './admin-panel'
import { catalogFailureMessage } from './catalog-errors'
import { StaffOnly } from './staff-only'

const PAGE_SIZE = 15
const QUERY_KEY = ['admin-prices']

type Panel = { kind: 'set' | 'history'; row: SkuPriceRow }

/**
 * Whole dong typed as 310000 or with thousands separators (310.000, 310,000, 310 000). Anything else, such as
 * 12.5, becomes NaN so the server explains the rule instead of the amount being silently misread.
 */
export function parseVnd(text: string): number {
  const value = text.trim()
  return /^\d+$/.test(value) || /^\d{1,3}([.,\s]\d{3})+$/.test(value)
    ? Number(value.replace(/[.,\s]/g, ''))
    : Number.NaN
}

const describeVariant = (row: SkuPriceRow) => Object.values(row.attributes).join(' / ')
const todayIso = () => new Date().toISOString().slice(0, 10)

export function PricesAdmin() {
  return (
    <StaffOnly role="MARKETING" what="manage prices">
      <PriceList />
    </StaffOnly>
  )
}

function SetPricePanel({
  row,
  onDone,
  onCancel,
}: {
  row: SkuPriceRow
  onDone: () => void
  onCancel: () => void
}) {
  const [price, setPrice] = useState('')
  const [from, setFrom] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string>()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setFormError(undefined)
    const amount = parseVnd(price)
    try {
      await setSkuPrice(row.skuId, { unitPriceVnd: amount, effectiveFrom: from })
      onDone()
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        setErrors({ ...error.fieldErrors })
      else setFormError(catalogFailureMessage(error))
      setBusy(false)
    }
  }

  return (
    <AdminPanel title={`Set price for ${row.skuId}`} onCancel={onCancel}>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5" aria-busy={busy}>
        <FormAlert message={formError} />
        <p className="text-sm text-ink-2">
          {describeVariant(row)}. Current price:{' '}
          {row.unitPriceVnd === null ? 'not set' : formatVnd(row.unitPriceVnd)} (incl. VAT).
        </p>
        <TextField
          label="New price (VND, incl. VAT)"
          inputMode="numeric"
          autoFocus
          value={price}
          hint="Whole dong, for example 300000."
          error={errors.unitPriceVnd?.[0]}
          onChange={(e) => setPrice(e.target.value)}
        />
        <TextField
          label="Effective from"
          type="date"
          value={from}
          error={errors.effectiveFrom?.[0]}
          onChange={(e) => setFrom(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn btn-primary self-start">
          {busy ? 'Saving…' : 'Save price'}
        </button>
      </form>
    </AdminPanel>
  )
}

function HistoryPanel({ row, onCancel }: { row: SkuPriceRow; onCancel: () => void }) {
  const history = useQuery({
    queryKey: ['admin-price-history', row.skuId],
    queryFn: () => getPriceHistory(row.skuId),
  })
  return (
    <AdminPanel title={`Price history of ${row.skuId}`} onCancel={onCancel}>
      <div className="mt-4">
        {history.isError ? (
          <FormAlert message="We could not load the history." />
        ) : !history.data ? (
          <p role="status" className="text-ink-2">
            Loading history…
          </p>
        ) : history.data.length === 0 ? (
          <p className="text-ink-2">No price has been set yet.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Price history</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th scope="col" className="font-label py-2 pr-3">
                  Price
                </th>
                <th scope="col" className="font-label py-2 pr-3">
                  From
                </th>
                <th scope="col" className="font-label py-2">
                  Until
                </th>
              </tr>
            </thead>
            <tbody>
              {[...history.data].reverse().map((entry) => (
                <tr key={entry.effectiveFrom} className="border-b border-rule">
                  <td className="py-2 pr-3">{formatVnd(entry.unitPriceVnd)}</td>
                  <td className="py-2 pr-3">{entry.effectiveFrom}</td>
                  <td className="py-2">{entry.effectiveTo ?? 'Current'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminPanel>
  )
}

function PriceList() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string>()
  const prices = useQuery({
    queryKey: [...QUERY_KEY, { q, page }],
    queryFn: () => listSkuPrices({ q, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  return (
    <div className="mt-6">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setQ(search.trim())
          setPage(1)
        }}
        className="flex items-end gap-2"
      >
        <div className="w-64">
          <TextField
            label="Search SKUs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {notice && (
        <p
          role="status"
          className="mt-4 max-w-[40rem] border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      {panel?.kind === 'set' && (
        <SetPricePanel
          key={panel.row.skuId}
          row={panel.row}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setNotice(`The price of ${panel.row.skuId} was saved.`)
            setPanel(null)
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
            void queryClient.invalidateQueries({
              queryKey: ['admin-price-history', panel.row.skuId],
            })
          }}
        />
      )}
      {panel?.kind === 'history' && (
        <HistoryPanel key={panel.row.skuId} row={panel.row} onCancel={() => setPanel(null)} />
      )}

      <div className="mt-8 overflow-x-auto">
        {prices.isError ? (
          <FormAlert message="We could not load the prices. Please reload the page." />
        ) : !prices.data ? (
          <p role="status" className="text-ink-2">
            Loading prices…
          </p>
        ) : prices.data.items.length === 0 ? (
          <p className="text-ink-2">No SKUs match.</p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">SKU prices</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th scope="col" className="font-label py-3 pr-4">
                  SKU
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Product
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Price (incl. VAT)
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Since
                </th>
                <th scope="col" className="py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.data.items.map((row) => (
                <tr key={row.skuId} className="border-b border-rule align-top">
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    {row.skuId}
                  </th>
                  <td className="py-3 pr-4">
                    {row.productName}
                    <span className="block text-muted">{describeVariant(row)}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {row.unitPriceVnd === null ? 'Not set' : formatVnd(row.unitPriceVnd)}
                  </td>
                  <td className="py-3 pr-4">{row.effectiveFrom ?? '—'}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      aria-label={`Set price for ${row.skuId}`}
                      onClick={() => {
                        setNotice(undefined)
                        setPanel({ kind: 'set', row })
                      }}
                      className="font-label min-h-11 pr-3 underline"
                    >
                      Set price
                    </button>
                    <button
                      type="button"
                      aria-label={`History of ${row.skuId}`}
                      onClick={() => {
                        setNotice(undefined)
                        setPanel({ kind: 'history', row })
                      }}
                      className="font-label min-h-11 underline"
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {prices.data && prices.data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((c) => c - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {prices.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= prices.data.pageCount}
            onClick={() => setPage((c) => c + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
