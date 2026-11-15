'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getMovements, postOpeningStock } from '@/inventory/admin-inventory-api'
import { movementLabel } from '@/inventory/scope'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import { formatDateTime } from '@/utils/format'
import { OpeningStockFormSchema } from '@/validations/inventory'
import { AdminPanel } from './admin-panel'
import { catalogFailureMessage } from './catalog-errors'

const OUT_OF_SCOPE = 'That warehouse is outside your warehouses, so you cannot add stock to it.'

function openingStockFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return OUT_OF_SCOPE
  return catalogFailureMessage(error)
}

export function MovementsPanel({
  skuId,
  warehouseId,
  onCancel,
}: {
  skuId: string
  warehouseId: string
  onCancel: () => void
}) {
  const movements = useQuery({
    queryKey: ['admin-inventory-movements', skuId, warehouseId],
    queryFn: () => getMovements(skuId, warehouseId),
  })
  return (
    <AdminPanel title={`Movement history of ${skuId}`} onCancel={onCancel} wide>
      <p className="mt-2 text-sm text-ink-2">Warehouse {warehouseId}, newest first.</p>
      <div className="mt-4 overflow-x-auto">
        {movements.isError ? (
          <FormAlert message="We could not load the history." />
        ) : !movements.data ? (
          <p role="status" className="text-ink-2">
            Loading history…
          </p>
        ) : movements.data.length === 0 ? (
          <p className="text-ink-2">No stock has moved yet.</p>
        ) : (
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <caption className="sr-only">Stock movements</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {['Type', 'Quantity', 'By', 'Reason', 'When'].map((heading) => (
                  <th key={heading} scope="col" className="font-label py-2 pr-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.data.map((movement) => (
                <tr key={movement.id} className="border-b border-rule align-top">
                  <td className="py-2 pr-3">{movementLabel(movement.type)}</td>
                  <td className="py-2 pr-3">{movement.qty}</td>
                  <td className="py-2 pr-3">{movement.actor}</td>
                  <td className="py-2 pr-3">{movement.reason}</td>
                  <td className="py-2">{formatDateTime(movement.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminPanel>
  )
}

export function OpeningStockPanel({
  warehouses,
  onDone,
  onCancel,
}: {
  warehouses: string[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    skuId: '',
    warehouseId: warehouses[0] ?? '',
    qty: '',
    reason: '',
  })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string>()
  const set = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(undefined)
    const parsed = OpeningStockFormSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await postOpeningStock(parsed.data)
      onDone(
        `Recorded ${parsed.data.qty} units of opening stock for ${parsed.data.skuId} in ${parsed.data.warehouseId}.`
      )
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        setErrors({ ...error.fieldErrors })
      else setFormError(openingStockFailure(error))
      setBusy(false)
    }
  }

  const onText = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(field)(e.target.value)

  return (
    <AdminPanel title="Add opening stock" onCancel={onCancel}>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5" aria-busy={busy}>
        <FormAlert message={formError} />
        <TextField
          label="SKU"
          autoFocus
          value={values.skuId}
          error={errors.skuId?.[0]}
          onChange={onText('skuId')}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="opening-warehouse" className="font-label text-sm text-ink">
            Warehouse
          </label>
          <select
            id="opening-warehouse"
            value={values.warehouseId}
            aria-invalid={errors.warehouseId ? true : undefined}
            onChange={(e) => set('warehouseId')(e.target.value)}
            className="h-11 w-full border border-rule-2 bg-paper px-3 text-ink"
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse} value={warehouse}>
                {warehouse}
              </option>
            ))}
          </select>
          {errors.warehouseId?.[0] && (
            <p role="alert" className="text-sm text-error">
              {errors.warehouseId[0]}
            </p>
          )}
        </div>
        <TextField
          label="Quantity"
          inputMode="numeric"
          value={values.qty}
          hint="Whole units added to on hand, for example 25."
          error={errors.qty?.[0]}
          onChange={onText('qty')}
        />
        <TextField
          label="Reason"
          value={values.reason}
          hint="Recorded with your name in the movement history."
          error={errors.reason?.[0]}
          onChange={onText('reason')}
        />
        <button type="submit" disabled={busy} className="btn btn-primary self-start">
          {busy ? 'Saving…' : 'Record opening stock'}
        </button>
      </form>
    </AdminPanel>
  )
}
