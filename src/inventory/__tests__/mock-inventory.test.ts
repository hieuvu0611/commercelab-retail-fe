import { createMockCatalogState, handleCatalogMock } from '@/catalog/mock-catalog'
import type { InventoryRow, StockMovement } from '@/types/inventory'
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
    expect(result.data).toEqual([
      { skuId: 'BP-CITY-BLK-20L', state: 'IN_STOCK' },
      { skuId: 'BTL-INS-BLK-500', state: 'OUT' },
      { skuId: 'NOPE', state: 'OUT' },
    ])
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
    expect(Object.keys(result.data[0]).sort()).toEqual(['skuId', 'state'])
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
    expect(hn.data[0].state).toBe('OUT')
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

describe('mock admin inventory', () => {
  it('is for warehouse roles only', () => {
    const state = createMockInventoryState()
    expect(call(state, null, 'GET', '/admin/inventory').status).toBe(401)
    expect(
      call(
        state,
        { name: 'M', roles: ['MARKETING'], warehouseScopes: [] },
        'GET',
        '/admin/inventory'
      ).status
    ).toBe(403)
    expect(call(state, HCM_STAFF, 'GET', '/admin/inventory').status).toBe(200)
  })

  it('shows buckets with available = on hand - unsellable - reserved - committed', () => {
    const state = createMockInventoryState()
    const result = call(state, HCM_STAFF, 'GET', '/admin/inventory', undefined, {
      q: 'BP-CITY-BLK-20L',
    })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      skuId: 'BP-CITY-BLK-20L',
      warehouseId: 'WH-HCM-01',
      onHand: 100,
      unsellable: 5,
      reserved: 10,
      committed: 15,
      available: 70,
    })
    const rows = call(state, HCM_STAFF, 'GET', '/admin/inventory', undefined, { limit: '100' })
      .data as InventoryRow[]
    expect(rows.every((row) => row.available >= 0)).toBe(true)
  })

  it('keeps staff inside their warehouse', () => {
    const state = createMockInventoryState()
    const rows = call(state, HCM_STAFF, 'GET', '/admin/inventory', undefined, { limit: '100' })
      .data as InventoryRow[]
    expect(new Set(rows.map((row) => row.warehouseId))).toEqual(new Set(['WH-HCM-01']))
    expect(
      call(state, HCM_STAFF, 'GET', '/admin/inventory', undefined, { warehouse: 'WH-HN-01' }).status
    ).toBe(403)
    expect(
      call(state, HCM_STAFF, 'GET', '/admin/inventory/BP-CITY-BLK-20L/movements', undefined, {
        warehouse: 'WH-HN-01',
      }).status
    ).toBe(403)
    const all = call(state, ALL_MGR, 'GET', '/admin/inventory', undefined, { limit: '100' })
      .data as InventoryRow[]
    expect(new Set(all.map((row) => row.warehouseId))).toEqual(new Set(['WH-HCM-01', 'WH-HN-01']))
  })

  it('lists movements newest first with who, why and when', () => {
    const state = createMockInventoryState()
    const result = call(
      state,
      HCM_STAFF,
      'GET',
      '/admin/inventory/BP-CITY-BLK-20L/movements',
      undefined,
      {
        warehouse: 'WH-HCM-01',
      }
    )
    const movements = result.data as StockMovement[]
    expect(movements.length).toBeGreaterThan(0)
    expect(movements[0]).toEqual(
      expect.objectContaining({
        type: expect.any(String),
        qty: expect.any(Number),
        actor: expect.any(String),
        reason: expect.any(String),
        at: expect.any(String),
      })
    )
    const times = movements.map((movement) => movement.at)
    expect([...times].sort().reverse()).toEqual(times)
  })
})

describe('mock opening stock', () => {
  const body = {
    skuId: 'BP-CITY-BLK-20L',
    warehouseId: 'WH-HCM-01',
    qty: 10,
    reason: 'Cycle count',
  }

  it('adds on-hand stock and records an OPENING movement with the actor and reason', () => {
    const state = createMockInventoryState()
    const created = call(state, HCM_MGR, 'POST', '/admin/inventory/opening-stock', body)
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({ onHand: 110, available: 80 })
    const movements = call(state, HCM_MGR, 'GET', '/admin/inventory/BP-CITY-BLK-20L/movements')
      .data as StockMovement[]
    expect(movements[0]).toMatchObject({
      type: 'OPENING',
      qty: 10,
      actor: 'HCM Manager',
      reason: 'Cycle count',
    })
  })

  it('is for the warehouse manager, not warehouse staff', () => {
    const state = createMockInventoryState()
    expect(call(state, HCM_STAFF, 'POST', '/admin/inventory/opening-stock', body).status).toBe(403)
    expect(call(state, null, 'POST', '/admin/inventory/opening-stock', body).status).toBe(401)
  })

  it('refuses another warehouse than the manager own', () => {
    const state = createMockInventoryState()
    const result = call(state, HCM_MGR, 'POST', '/admin/inventory/opening-stock', {
      ...body,
      warehouseId: 'WH-HN-01',
    })
    expect(result.status).toBe(403)
    expect(
      call(state, ALL_MGR, 'POST', '/admin/inventory/opening-stock', {
        ...body,
        warehouseId: 'WH-HN-01',
      }).status
    ).toBe(201)
  })

  it('validates the fields', () => {
    const state = createMockInventoryState()
    const post = (patch: Record<string, unknown>) =>
      call(state, HCM_MGR, 'POST', '/admin/inventory/opening-stock', { ...body, ...patch })
    expect(post({ skuId: '' }).errors?.skuId).toBeDefined()
    expect(post({ skuId: 'NOPE' }).errors?.skuId).toBeDefined()
    expect(post({ qty: 0 }).errors?.qty).toBeDefined()
    expect(post({ qty: 1.5 }).errors?.qty).toBeDefined()
    expect(post({ qty: '5' }).errors?.qty).toBeDefined()
    expect(post({ qty: 1_000_001 }).errors?.qty).toBeDefined()
    expect(post({ reason: 'ab' }).errors?.reason).toBeDefined()
    expect(post({ warehouseId: '' }).errors?.warehouseId).toBeDefined()
    expect(post({ qty: 0 }).status).toBe(422)
  })
})
