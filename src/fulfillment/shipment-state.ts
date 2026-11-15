import { ApiError } from '@/services/api/api-error'
import type { ShipmentDetail, ShipmentStatus } from '@/types/fulfillment'

/** Roles that work the warehouse queue (GET /admin/shipments); the service limits them to their warehouses. */
export const SHIPMENT_ROLES = ['WAREHOUSE_STAFF', 'WAREHOUSE_MGR'] as const

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING_PICK: 'Waiting to be picked',
  PICKING: 'Being picked',
  PACKED: 'Packed, ready for handover',
  HANDED_OVER: 'Handed to the carrier',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery failed',
  PARTIALLY_DELIVERED: 'Partly delivered',
  PICK_BLOCKED: 'Blocked: stock shortage',
  STOPPED_FOR_CANCEL: 'Stopped for cancellation',
}

export const shipmentStatusLabel = (status: ShipmentStatus): string => STATUS_LABELS[status]

/** Work left on the pick list: scanning and packing are only possible before the parcel is packed. */
export const isPickable = (shipment: Pick<ShipmentDetail, 'status'>): boolean =>
  shipment.status === 'PENDING_PICK' || shipment.status === 'PICKING'

export const isFullyPicked = (shipment: Pick<ShipmentDetail, 'lines'>): boolean =>
  shipment.lines.length > 0 &&
  shipment.lines.every((line) => line.pickedQuantity >= line.orderedQuantity)

const PROBLEMS: Record<string, string> = {
  SKU_NOT_ON_PICK_LIST: 'That code is not on this pick list. Check the item and scan again.',
  QUANTITY_EXCEEDS_ORDER: 'That would pick more than the order asks for. Nothing was recorded.',
  PICK_INCOMPLETE: 'Some lines are not fully picked yet.',
  STALE_VERSION: 'Someone else changed this shipment. It was reloaded: check it and try again.',
  FORBIDDEN_WAREHOUSE_SCOPE: 'This shipment belongs to a warehouse outside your access.',
  HANDOVER_NOT_ALLOWED: 'This shipment cannot be handed over in its current state.',
  SHIPMENT_NOT_PICKABLE: 'This shipment is no longer open for picking.',
  INVENTORY_HANDOVER_REJECTED:
    'Stock could not be released for this parcel. Nothing was handed over.',
  INVALID_STATE: 'This shipment cannot be changed in its current state.',
}

/** Words a refused or failed shipment action for the person at the bench. */
export function shipmentProblem(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  return PROBLEMS[code] ?? 'We could not save that. Please try again.'
}

export const isStaleVersion = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'STALE_VERSION'
