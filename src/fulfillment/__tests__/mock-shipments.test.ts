import type { MockRequest } from '@/auth/mock-api'
import { createMockOrderState, type MockOrder } from '@/orders/mock-orders'
import { createMockFulfillmentState, type FulfillmentMockDeps } from '../mock-fulfillment'
import { handleShipmentAdminMock, type ShipmentCaller } from '../mock-shipments'

const NOW = Date.parse('2026-11-15T10:00:00.000Z')

const order = (orderId: string): MockOrder =>
  ({
    orderId,
    userId: 'u1',
    status: 'CONFIRMED',
    createdAt: '2026-11-15T09:00:00.000Z',
    confirmedAt: '2026-11-15T09:05:00.000Z',
    snapshot: {
      lines: [
        { skuId: 'BP-1', skuName: 'Backpack', quantity: 2 },
        { skuId: 'BT-1', skuName: 'Bottle', quantity: 1 },
      ],
      address: null,
    },
  }) as unknown as MockOrder

const hcmStaff: ShipmentCaller = {
  name: 'Warehouse HCM',
  roles: ['WAREHOUSE_STAFF'],
  warehouseScopes: ['WH-HCM-01'],
}
const allManager: ShipmentCaller = {
  name: 'Manager',
  roles: ['WAREHOUSE_MGR'],
  warehouseScopes: ['ALL'],
}

let deps: FulfillmentMockDeps
beforeEach(() => {
  deps = {
    orders: createMockOrderState(),
    fulfillment: createMockFulfillmentState(),
    now: () => NOW,
  }
  // O-001 is picked in Ho Chi Minh City, O-002 in Hanoi.
  deps.orders.orders.set('O-001', order('O-001'))
  deps.orders.orders.set('O-002', order('O-002'))
})

type Data = Record<string, unknown>
const get = (
  path: string,
  caller: ShipmentCaller | null = hcmStaff,
  query?: Record<string, string>
) => handleShipmentAdminMock({ method: 'GET', path, query }, caller, deps)
const post = (
  action: string,
  body: Record<string, unknown> = {},
  caller: ShipmentCaller | null = hcmStaff,
  id = 'SHP-O-001'
) =>
  handleShipmentAdminMock(
    { method: 'POST', path: `/admin/shipments/${id}/${action}`, body } satisfies MockRequest,
    caller,
    deps
  )
const data = (response: ReturnType<typeof get>) => (response?.body as { data: Data }).data
const code = (response: ReturnType<typeof get>) => (response?.body as { code?: string }).code

const pickAll = () => {
  post('scan', { skuId: 'BP-1', quantity: 2 })
  post('scan', { skuId: 'BT-1', quantity: 1 })
}

describe('handleShipmentAdminMock', () => {
  it('ignores other requests', () => {
    expect(get('/admin/orders')).toBeNull()
  })

  it('needs a signed-in warehouse role', () => {
    expect(get('/admin/shipments', null)?.status).toBe(401)
    expect(
      get('/admin/shipments', { name: 'Support', roles: ['SUPPORT_AGENT'], warehouseScopes: [] })
        ?.status
    ).toBe(403)
  })

  it('lists only the shipments of the warehouses in scope, in the real envelope', () => {
    const response = get('/admin/shipments')
    const rows = data(response) as unknown as Array<Data>
    expect(rows.map((entry) => entry.shipmentId)).toEqual(['SHP-O-001'])
    expect(response?.body).toMatchObject({
      message: expect.any(String),
      metadata: { total: 1, page: 1 },
    })
    expect(
      (data(get('/admin/shipments', allManager)) as unknown as Array<Data>).map(
        (entry) => entry.warehouseId
      )
    ).toEqual(['WH-HN-01', 'WH-HCM-01'])
  })

  it('filters the queue by status', () => {
    expect(
      data(get('/admin/shipments', allManager, { status: 'PICKING' })) as unknown as Data[]
    ).toEqual([])
    expect(get('/admin/shipments', allManager, { limit: '0' })?.status).toBe(400)
  })

  it('refuses the detail and every action of a shipment in another warehouse', () => {
    expect(get('/admin/shipments/SHP-O-002')?.status).toBe(403)
    expect(code(get('/admin/shipments/SHP-O-002'))).toBe('FORBIDDEN_WAREHOUSE_SCOPE')
    expect(code(post('scan', { skuId: 'BP-1', quantity: 1 }, hcmStaff, 'SHP-O-002'))).toBe(
      'FORBIDDEN_WAREHOUSE_SCOPE'
    )
    expect(get('/admin/shipments/SHP-O-404')?.status).toBe(404)
  })

  it('returns the pick list with nothing picked yet', () => {
    const shipment = data(get('/admin/shipments/SHP-O-001'))
    expect(shipment).toMatchObject({ status: 'PENDING_PICK', version: 1 })
    expect(shipment.items).toEqual([
      { skuId: 'BP-1', quantity: 2, pickedQuantity: 0, deliveredQuantity: 0 },
      { skuId: 'BT-1', quantity: 1, pickedQuantity: 0, deliveredQuantity: 0 },
    ])
  })

  it('records a scan, starts picking and raises the version', () => {
    const shipment = data(post('scan', { skuId: ' BP-1 ', quantity: 1 }))
    expect(shipment).toMatchObject({ status: 'PICKING', version: 2 })
    expect((shipment.items as Data[])[0].pickedQuantity).toBe(1)
  })

  it('refuses a SKU that is not on the pick list and more than was ordered', () => {
    expect(code(post('scan', { skuId: 'NOPE', quantity: 1 }))).toBe('SKU_NOT_ON_PICK_LIST')
    expect(post('scan', { skuId: 'NOPE', quantity: 1 })?.status).toBe(422)
    post('scan', { skuId: 'BP-1', quantity: 2 })
    expect(code(post('scan', { skuId: 'BP-1', quantity: 1 }))).toBe('QUANTITY_EXCEEDS_ORDER')
    expect(post('scan', { skuId: 'BT-1', quantity: 0 })?.status).toBe(400)
  })

  it('refuses a change made on an old version', () => {
    post('scan', { skuId: 'BP-1', quantity: 1 })
    expect(code(post('scan', { skuId: 'BP-1', quantity: 1, version: 1 }))).toBe('STALE_VERSION')
    expect(post('scan', { skuId: 'BP-1', quantity: 1, version: 2 })?.status).toBe(200)
  })

  it('packs only when every line is fully picked', () => {
    post('scan', { skuId: 'BP-1', quantity: 2 })
    expect(code(post('pack'))).toBe('PICK_INCOMPLETE')
    post('scan', { skuId: 'BT-1', quantity: 1 })
    expect(data(post('pack')).status).toBe('PACKED')
  })

  it('hands over only a packed shipment, and a second handover is refused', () => {
    expect(code(post('handover'))).toBe('HANDOVER_NOT_ALLOWED')
    pickAll()
    post('pack')
    const handed = data(post('handover'))
    expect(handed).toMatchObject({
      status: 'HANDED_OVER',
      handedOverAt: new Date(NOW).toISOString(),
    })
    expect(code(post('handover'))).toBe('HANDOVER_NOT_ALLOWED')
  })

  it('blocks a shipment on a shortage, which can then never be packed or handed over', () => {
    post('scan', { skuId: 'BP-1', quantity: 1 })
    const blocked = data(post('report-shortage', { skuId: 'BP-1', reason: 'Damaged on the shelf' }))
    expect(blocked).toMatchObject({
      status: 'PICK_BLOCKED',
      failureReason: 'Damaged on the shelf',
    })
    expect(code(post('pack'))).toBe('SHIPMENT_NOT_PICKABLE')
    expect(code(post('handover'))).toBe('HANDOVER_NOT_ALLOWED')
    expect(code(post('scan', { skuId: 'BP-1', quantity: 1 }))).toBe('SHIPMENT_NOT_PICKABLE')
  })

  it('needs a reason and a SKU of the pick list for a shortage', () => {
    expect(post('report-shortage', { skuId: 'BP-1', reason: '  ' })?.status).toBe(400)
    expect(code(post('report-shortage', { skuId: 'NOPE', reason: 'x' }))).toBe(
      'SKU_NOT_ON_PICK_LIST'
    )
  })
})
