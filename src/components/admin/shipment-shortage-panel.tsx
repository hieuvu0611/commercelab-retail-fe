'use client'

import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { reportShortage } from '@/fulfillment/shipments-api'
import { shipmentProblem } from '@/fulfillment/shipment-state'
import type { ShipmentDetail, ShipmentLine } from '@/types/fulfillment'
import { AdminPanel } from './admin-panel'

/** Reports that a SKU of the pick list cannot be found in good condition; the shipment is blocked and never dispatched. */
export function ShortagePanel({
  shipmentId,
  lines,
  version,
  onCancel,
  onDone,
  onFailed,
}: {
  shipmentId: string
  lines: ShipmentLine[]
  version: number
  onCancel: () => void
  onDone: (shipment: ShipmentDetail) => void
  onFailed: (error: unknown) => void
}) {
  const [skuId, setSkuId] = useState(lines[0]?.skuId ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const report = useMutation({
    mutationFn: () => reportShortage(shipmentId, { skuId, reason: reason.trim(), version }),
    onSuccess: onDone,
    onError: (failure) => {
      setError(shipmentProblem(failure))
      onFailed(failure)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) return setError('Say what is wrong, for example "damaged on the shelf".')
    setError(undefined)
    report.mutate()
  }

  return (
    <AdminPanel title="Report a shortage" onCancel={onCancel}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
        <p className="text-sm text-ink-2">
          The shipment will be blocked and will not be dispatched. Support is told to contact the
          customer.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="shortage-sku" className="font-label text-sm text-ink">
            SKU
          </label>
          <select
            id="shortage-sku"
            value={skuId}
            onChange={(event) => setSkuId(event.target.value)}
            className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink"
          >
            {lines.map((line) => (
              <option key={line.skuId} value={line.skuId}>
                {line.skuId} — {line.skuName}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
        <FormAlert message={error} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={report.isPending}>
            Block shipment
          </button>
        </div>
      </form>
    </AdminPanel>
  )
}
