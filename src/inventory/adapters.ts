import type {
  Availability,
  AvailabilityEntry,
  InventoryRow,
  MovementType,
  StockMovement,
  StockState,
} from '@/types/inventory'
import { MOVEMENT_TYPES } from '@/types/inventory'

// The inventory service (be) and this app may describe a few things differently. These functions translate the
// service's JSON into the app's types in one place. They accept the app's own shape too, so the in-app mock
// backend passes through unchanged.

const STATES: readonly StockState[] = ['IN_STOCK', 'LOW', 'OUT']

type Raw = Record<string, unknown>

const asRecord = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value !== '' ? value : fallback

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** Any unrecognised, missing or "unknown" value is "unknown" so the page never breaks on it. */
export function toAvailability(value: unknown): Availability {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return STATES.find((state) => state === upper) ?? 'unknown'
}

/**
 * One state for a product that has several SKUs: any sellable SKU makes it sellable (best case first); it is out
 * only when every SKU is out; a missing answer for some SKU keeps the summary "unknown" rather than claiming out.
 */
export function summarizeAvailability(states: Availability[]): Availability {
  if (states.includes('IN_STOCK')) return 'IN_STOCK'
  if (states.includes('LOW')) return 'LOW'
  if (states.length > 0 && states.every((state) => state === 'OUT')) return 'OUT'
  return 'unknown'
}

/**
 * GET /inventory/availability sends data {warehouseId, items: [...]}; a bare list is accepted too. Drops entries
 * without a SKU or with a state other than the three known ones.
 */
export function toAvailabilityEntries(raw: unknown): AvailabilityEntry[] {
  const items = Array.isArray(raw) ? raw : asRecord(raw).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const entry = asRecord(item)
    const state = toAvailability(entry.state)
    return typeof entry.skuId === 'string' && entry.skuId !== '' && state !== 'unknown'
      ? [{ skuId: entry.skuId, state }]
      : []
  })
}

/**
 * Availability of a list card. The service may send one state, a list of per-SKU entries, or a map from SKU
 * to state; they are all summarised into one state.
 */
export function toListAvailability(raw: unknown): Availability {
  if (Array.isArray(raw)) {
    return summarizeAvailability(
      raw.map((entry) => toAvailability(asRecord(entry).state ?? asRecord(entry).availability))
    )
  }
  if (raw !== null && typeof raw === 'object') {
    return summarizeAvailability(Object.values(raw).map((value) => toAvailability(value)))
  }
  return toAvailability(raw)
}

/** A stock row; `available` is computed (never negative) when the service leaves it out. */
export function toInventoryRow(raw: unknown): InventoryRow {
  const row = asRecord(raw)
  const onHand = count(row.onHand)
  const unsellable = count(row.unsellable)
  const reserved = count(row.reserved)
  const committed = count(row.committed)
  const skuId = text(row.skuId)
  return {
    skuId,
    warehouseId: text(row.warehouseId ?? row.warehouse),
    onHand,
    unsellable,
    reserved,
    committed,
    available:
      typeof row.available === 'number'
        ? Math.max(row.available, 0)
        : Math.max(onHand - unsellable - reserved - committed, 0),
  }
}

/** A ledger record; the service numbers records (id is a number) and names the person by actorId only. */
export function toMovement(raw: unknown): StockMovement {
  const movement = asRecord(raw)
  const type = text(movement.type).toUpperCase()
  return {
    id: typeof movement.id === 'number' ? String(movement.id) : text(movement.id),
    skuId: text(movement.skuId),
    warehouseId: text(movement.warehouseId ?? movement.warehouse),
    type: (MOVEMENT_TYPES as readonly string[]).includes(type) ? (type as MovementType) : 'ADJUST',
    qty: count(movement.qty ?? movement.quantity),
    actor: text(movement.actor ?? movement.actorId, 'Unknown'),
    reason: text(movement.reason),
    at: text(movement.at ?? movement.createdAt),
  }
}
