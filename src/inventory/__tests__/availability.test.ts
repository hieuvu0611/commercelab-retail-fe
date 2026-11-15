import {
  toAvailability,
  toAvailabilityEntries,
  toInventoryRow,
  toMovement,
  summarizeAvailability,
} from '../adapters'
import { availabilityLabel, stateFromAvailable } from '../availability'

describe('availability adapters', () => {
  it('accepts the three states in any case and maps everything else to unknown', () => {
    expect(toAvailability('IN_STOCK')).toBe('IN_STOCK')
    expect(toAvailability('low')).toBe('LOW')
    expect(toAvailability('OUT')).toBe('OUT')
    expect(toAvailability('unknown')).toBe('unknown')
    expect(toAvailability(undefined)).toBe('unknown')
    expect(toAvailability(null)).toBe('unknown')
    expect(toAvailability('PLENTY')).toBe('unknown')
    expect(toAvailability(42)).toBe('unknown')
  })

  it('summarises many SKUs: any sellable SKU wins, all out is out, nothing known is unknown', () => {
    expect(summarizeAvailability([])).toBe('unknown')
    expect(summarizeAvailability(['OUT', 'IN_STOCK'])).toBe('IN_STOCK')
    expect(summarizeAvailability(['OUT', 'LOW'])).toBe('LOW')
    expect(summarizeAvailability(['OUT', 'OUT'])).toBe('OUT')
    expect(summarizeAvailability(['OUT', 'unknown'])).toBe('unknown')
    expect(summarizeAvailability(['unknown', 'unknown'])).toBe('unknown')
  })

  it('reads availability entries and drops malformed ones', () => {
    expect(
      toAvailabilityEntries([
        { skuId: 'A', state: 'LOW' },
        { skuId: 'B', state: 'nonsense' },
        null,
        {},
      ])
    ).toEqual([{ skuId: 'A', state: 'LOW' }])
    expect(toAvailabilityEntries(null)).toEqual([])
  })

  it('derives the state from the available quantity with the low threshold', () => {
    expect(stateFromAvailable(0)).toBe('OUT')
    expect(stateFromAvailable(-2)).toBe('OUT')
    expect(stateFromAvailable(1)).toBe('LOW')
    expect(stateFromAvailable(3)).toBe('LOW')
    expect(stateFromAvailable(4)).toBe('IN_STOCK')
  })

  it('labels states for customers without counts', () => {
    expect(availabilityLabel('IN_STOCK')).toBe('In stock')
    expect(availabilityLabel('LOW')).toBe('Low stock')
    expect(availabilityLabel('OUT')).toBe('Out of stock')
    expect(availabilityLabel('unknown')).toBeNull()
  })
})

describe('inventory adapters', () => {
  it('computes available when the service omits it and never goes below zero', () => {
    const row = toInventoryRow({
      skuId: 'A',
      warehouseId: 'WH-HCM-01',
      onHand: 100,
      unsellable: 5,
      reserved: 10,
      committed: 15,
    })
    expect(row.available).toBe(70)
    expect(toInventoryRow({ skuId: 'A', onHand: 1, reserved: 5 }).available).toBe(0)
  })

  it('keeps a reported available quantity, defaults missing buckets to zero and the name to the SKU', () => {
    const row = toInventoryRow({ skuId: 'A', warehouse: 'WH-HN-01', onHand: 9, available: 8 })
    expect(row).toMatchObject({
      skuId: 'A',
      warehouseId: 'WH-HN-01',
      onHand: 9,
      unsellable: 0,
      reserved: 0,
      committed: 0,
      available: 8,
      productName: 'A',
      attributes: {},
    })
  })

  it('reads movements with alternative field names', () => {
    expect(
      toMovement({
        id: 'm1',
        skuId: 'A',
        warehouse: 'WH-HCM-01',
        type: 'OPENING',
        quantity: 10,
        actorId: 'staff-1',
        reason: 'Count',
        createdAt: '2026-11-01T01:00:00Z',
      })
    ).toEqual({
      id: 'm1',
      skuId: 'A',
      warehouseId: 'WH-HCM-01',
      type: 'OPENING',
      qty: 10,
      actor: 'staff-1',
      reason: 'Count',
      at: '2026-11-01T01:00:00Z',
    })
  })
})
