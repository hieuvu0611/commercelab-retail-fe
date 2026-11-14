'use client'

import { useId } from 'react'
import { ROLE_OPTIONS, WAREHOUSES } from '@/configs/roles'

export interface GrantValue {
  role: string
  warehouseId?: string
}

interface RolePickerProps {
  value: GrantValue[]
  onChange: (next: GrantValue[]) => void
  error?: string
}

const ALL_WAREHOUSES = ''

// Choose roles; warehouse roles can be limited to one warehouse ("All warehouses" is the default).
export function RolePicker({ value, onChange, error }: RolePickerProps) {
  const idPrefix = useId()
  const errorId = `${idPrefix}-error`

  function toggle(role: string, checked: boolean) {
    onChange(checked ? [...value, { role }] : value.filter((grant) => grant.role !== role))
  }

  function setWarehouse(role: string, warehouseId: string) {
    onChange(
      value.map((grant) =>
        grant.role === role ? { role, ...(warehouseId && { warehouseId }) } : grant
      )
    )
  }

  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="flex flex-col gap-2"
    >
      <legend className="font-label mb-1 text-sm text-ink">Roles</legend>
      {ROLE_OPTIONS.map((option) => {
        const grant = value.find((candidate) => candidate.role === option.value)
        const checkboxId = `${idPrefix}-${option.value}`
        return (
          <div key={option.value} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label
              htmlFor={checkboxId}
              className="flex min-h-11 items-center gap-2 text-sm text-ink"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={Boolean(grant)}
                onChange={(event) => toggle(option.value, event.target.checked)}
                className="size-4 accent-accent"
              />
              {option.label}
            </label>
            {grant && option.isWarehouseRole && (
              <select
                aria-label={`Warehouse for ${option.label}`}
                value={grant.warehouseId ?? ALL_WAREHOUSES}
                onChange={(event) => setWarehouse(option.value, event.target.value)}
                className="h-11 rounded-control border border-rule-2 bg-paper px-2 text-sm text-ink"
              >
                <option value={ALL_WAREHOUSES}>All warehouses</option>
                {WAREHOUSES.map((warehouse) => (
                  <option key={warehouse} value={warehouse}>
                    {warehouse}
                  </option>
                ))}
              </select>
            )}
          </div>
        )
      })}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
