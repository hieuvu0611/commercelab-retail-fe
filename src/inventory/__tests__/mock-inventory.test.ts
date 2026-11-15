import { createMockCatalogState, handleCatalogMock } from '@/catalog/mock-catalog'
import type { InventoryRow } from '@/types/inventory'
import {
  createMockInventoryState,
  handleInventoryMock,
  type InventoryCaller,
} from '../mock-inventory'

const HCM_MGR: InventoryCaller = {
  name: 'HCM Manager',
  roles: ['WAREHOUSE_MGR'],
  warehouseScopes: ['WH-HCM-01'],
}
const HCM_STAFF: InventoryCaller = {
  name: 'Warehouse HCM',
  roles: ['WAREHOUSE_STAFF'],
  warehouseScopes: ['WH-HCM-01'],
}
const ALL_MGR: InventoryCaller = { ...HCM_MGR, warehouseScopes: ['ALL'] }

const call = (
  state: ReturnType<typeof createMockInventoryState>,
  caller: InventoryCaller | null,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
) => {
  const response = handleInventoryMock({ method, path, body, query }, caller, state)!
  return {
    status: response.status,
    ...(response.body as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?: any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata?: any
      code?: string
      errors?: Record<string, string[]>
    }),
  }
}

describe('mock public availability', () => {
  it('answers a state per SKU and needs no sign-in', () => {
    const state = createMockInventoryState()
    const result = call(state, null, 'GET', '/inventory/availability', undefined, {
      skuIds: 'BP-CITY-BLK-20L,BTL-INS-BLK-500,NOPE',
    })
    expect(result.status).toBe(200)
    expect(result.data).toEqual({
      warehouseId: 'WH-HCM-01',
      items: [
        { skuId: 'BP-CITY-BLK-20L', state: 'IN_STOCK' },
        { skuId: 'BTL-INS-BLK-500', state: 'OUT' },
        { skuId: 'NOPE', state: 'OUT' },
      ],
    })
  })

  it('never exposes counts', () => {
    const result = call(
      createMockInventoryState(),
      null,
      'GET',
      '/inventory/availability',
      undefined,
      {
        skuIds: 'BP-CITY-BLK-20L',
      }
    )
    expect(Object.keys(result.data.items[0]).sort()).toEqual(['skuId', 'state'])
  })

  it('rejects a missing SKU list or an unknown warehouse', () => {
    const state = createMockInventoryState()
    expect(call(state, null, 'GET', '/inventory/availability').status).toBe(422)
    expect(
      call(state, null, 'GET', '/inventory/availability', undefined, {
        skuIds: 'A',
        warehouse: 'WH-XX',
      }).status
    ).toBe(422)
  })

  it('limits the answer to one warehouse when asked', () => {
    const state = createMockInventoryState()
    const hn = call(state, null, 'GET', '/inventory/availability', undefined, {
      skuIds: 'CITY-BACKPACK-BLACK-25-L',
      warehouse: 'WH-HN-01',
    })
    expect(hn.data.items[0].state).toBe('OUT')
  })
})

describe('mock catalogue availability', () => {
  it('carries a state on every SKU of the product page and a summary on list cards', () => {
    const catalog = createMockCatalogState()
    const detail = handleCatalogMock(
      { method: 'GET', path: '/products/city-backpack' },
      null,
      catalog,
      createMockInventoryState()
    )!.body as { data: { skus: { skuId: string; availability: string }[] } }
    expect(detail.data.skus.find((sku) => sku.skuId === 'BP-CITY-BLK-20L')?.availability).toBe(
      'IN_STOCK'
    )
    expect(
      detail.data.skus.every((sku) => ['IN_STOCK', 'LOW', 'OUT'].includes(sku.availability))
    ).toBe(true)

    const list = handleCatalogMock(
      { method: 'GET', path: '/products', query: { limit: '100' } },
      null,
      catalog,
      createMockInventoryState()
    )!.body as { data: { availability: string }[] }
    expect(list.data.every((item) => ['IN_STOCK', 'LOW', 'OUT'].includes(item.availability))).toBe(
      true
    )
  })
})

const STOCK = '/admin/inventory/stock'
const MOVEMENTS = '/admin/inventory/movements'
const HCM = { warehouse: 'WH-HCM-01' }

describe('mock admin inventory', () => {
  it('is for warehouse roles only', () => {
    const state = createMockInventoryState()
    expect(call(state, null, 'GET', STOCK, undefined, HCM).status).toBe(401)
    expect(
      call(
        state,
        { name: 'M', roles: ['MARKETING'], warehouseScopes: [] },
        'GET',
        STOCK,
        undefined,
        HCM
      ).status
    ).toBe(403)
    expect(call(state, HCM_STAFF, 'GET', STOCK, undefined, HCM).status).toBe(200)
  })

  it('needs the warehouse, like the service', () => {
    const state = createMockInventoryState()
    expect(call(state, HCM_STAFF, 'GET', STOCK).status).toBe(400)
    expect(call(state, HCM_STAFF, 'GET', MOVEMENTS).status).toBe(400)
  })

  it('shows buckets with available = on hand - unsellable - reserved - committed', () => {
    const state = createMockInventoryState()
    const rows = call(state, HCM_STAFF, 'GET', STOCK, undefined, HCM).data as InventoryRow[]
    expect(rows.find((row) => row.skuId === 'BP-CITY-BLK-20L')).toMatchObject({
      warehouseId: 'WH-HCM-01',
      onHand: 100,
      unsellable: 5,
      reserved: 10,
      committed: 15,
      inTransit: 0,
      available: 70,
    })
    expect(rows.every((row) => row.available >= 0)).toBe(true)
  })

  it('keeps staff inside their warehouse', () => {
    const state = createMockInventoryState()
    const hn = { warehouse: 'WH-HN-01' }
    expect(call(state, HCM_STAFF, 'GET', STOCK, undefined, hn).status).toBe(403)
    expect(call(state, HCM_STAFF, 'GET', MOVEMENTS, undefined, hn).status).toBe(403)
    const rows = call(state, ALL_MGR, 'GET', STOCK, undefined, hn).data as InventoryRow[]
    expect(new Set(rows.map((row) => row.warehouseId))).toEqual(new Set(['WH-HN-01']))
  })

  it('lists movements of one SKU newest first with who, why and when', () => {
    const state = createMockInventoryState()
    const result = call(state, HCM_STAFF, 'GET', MOVEMENTS, undefined, {
      ...HCM,
      skuId: 'BP-CITY-BLK-20L',
    })
    const movements = result.data as Array<Record<string, unknown>>
    expect(movements.length).toBeGreaterThan(0)
    expect(movements[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        type: expect.any(String),
        qty: expect.any(Number),
        actorId: expect.any(String),
        reason: expect.any(String),
        at: expect.any(String),
      })
    )
    expect(movements.every((movement) => movement.skuId === 'BP-CITY-BLK-20L')).toBe(true)
    const times = movements.map((movement) => movement.at as string)
    expect([...times].sort().reverse()).toEqual(times)
    expect(result.metadata).toMatchObject({ total: movements.length, page: 1 })
  })
})

describe('mock opening stock', () => {
  const body = {
    warehouseId: 'WH-HCM-01',
    reason: 'First count',
    lines: [{ skuId: 'NEW-SKU-1', quantity: 10 }],
  }
  const URL = '/admin/inventory/opening-stock'

  it('adds on-hand stock and records an OPENING movement with the actor and reason', () => {
    const state = createMockInventoryState()
    const created = call(state, HCM_MGR, 'POST', URL, body)
    expect(created.status).toBe(201)
    const rows = call(state, HCM_MGR, 'GET', STOCK, undefined, HCM).data as InventoryRow[]
    expect(rows.find((row) => row.skuId === 'NEW-SKU-1')).toMatchObject({
      onHand: 10,
      available: 10,
    })
    const movements = call(state, HCM_MGR, 'GET', MOVEMENTS, undefined, {
      ...HCM,
      skuId: 'NEW-SKU-1',
    }).data as Array<Record<string, unknown>>
    expect(movements[0]).toMatchObject({
      type: 'OPENING',
      qty: 10,
      actorId: 'HCM Manager',
      reason: 'First count',
    })
  })

  it('answers 409 when the SKU already has opening stock in that warehouse', () => {
    const state = createMockInventoryState()
    const again = call(state, HCM_MGR, 'POST', URL, {
      ...body,
      lines: [{ skuId: 'BP-CITY-BLK-20L', quantity: 5 }],
    })
    expect(again.status).toBe(409)
    expect(again.code).toBe('OPENING_STOCK_ALREADY_RECORDED')
    expect(call(state, HCM_MGR, 'POST', URL, body).status).toBe(201)
    expect(call(state, HCM_MGR, 'POST', URL, body).status).toBe(409)
  })

  it('is for the warehouse manager, not warehouse staff', () => {
    const state = createMockInventoryState()
    expect(call(state, HCM_STAFF, 'POST', URL, body).status).toBe(403)
    expect(call(state, null, 'POST', URL, body).status).toBe(401)
  })

  it('refuses another warehouse than the manager own', () => {
    const state = createMockInventoryState()
    const other = { ...body, warehouseId: 'WH-HN-01' }
    const result = call(state, HCM_MGR, 'POST', URL, other)
    expect(result.status).toBe(403)
    expect(result.code).toBe('WAREHOUSE_FORBIDDEN')
    expect(call(state, ALL_MGR, 'POST', URL, other).status).toBe(201)
  })

  it('validates the body', () => {
    const state = createMockInventoryState()
    const post = (patch: Record<string, unknown>) =>
      call(state, HCM_MGR, 'POST', URL, { ...body, ...patch })
    const line = (quantity: unknown, skuId: unknown = 'NEW-SKU-2') => ({
      lines: [{ skuId, quantity }],
    })
    for (const patch of [
      { warehouseId: '' },
      { reason: '' },
      { lines: [] },
      line(0),
      line(1.5),
      line('5'),
      line(1_000_001),
      line(5, ''),
    ]) {
      const result = post(patch)
      expect(result.status).toBe(400)
      expect(result.code).toBe('VALIDATION_FAILED')
    }
  })
})
