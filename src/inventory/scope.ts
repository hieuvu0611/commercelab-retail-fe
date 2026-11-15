import { WAREHOUSES } from '@/configs/roles'
import type { MovementType } from '@/types/inventory'

const ALL_WAREHOUSES = 'ALL'

/** The warehouses a session may see: "ALL" in its scopes means every warehouse. */
export function warehousesInScope(scopes: readonly string[]): string[] {
  return scopes.includes(ALL_WAREHOUSES)
    ? [...WAREHOUSES]
    : WAREHOUSES.filter((warehouse) => scopes.includes(warehouse))
}

const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING: 'Opening stock',
  RESERVE: 'Reserved',
  COMMIT: 'Committed',
  RELEASE: 'Released',
  HANDOVER: 'Handed over',
  RETURN_RECEIVE: 'Return received',
  QC_PASS: 'Passed quality check',
  ADJUST: 'Adjustment',
}

export const movementLabel = (type: MovementType): string => MOVEMENT_LABELS[type]
