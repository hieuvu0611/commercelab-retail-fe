import { toOrderTracking, toShipmentDetail, toShipmentRow } from '../adapters'

describe('toOrderTracking', () => {
  it('reads the service timeline oldest first and names its first entries as pending pick and picking', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      shipmentId: 'SHP-O-001',
      status: 'IN_TRANSIT',
      timeline: [
        { at: '2026-11-16T09:00:00Z', type: 'IN_TRANSIT', message: 'Your parcel is on its way' },
        {
          at: '2026-11-15T10:00:00Z',
          type: 'CREATED',
          message: 'The warehouse received your order',
        },
        { at: '2026-11-15T11:00:00Z', type: 'PICKING_STARTED', message: 'We started picking' },
      ],
      quantities: [{ skuId: 'BP-1', ordered: 2, dispatched: 2, delivered: 0, returned: 0 }],
    })
    expect(tracking.events.map((event) => event.status)).toEqual([
      'PENDING_PICK',
      'PICKING',
      'IN_TRANSIT',
    ])
    expect(tracking.events[2].label).toBe('Your parcel is on its way')
    expect(tracking.status).toBe('IN_TRANSIT')
    expect(tracking.quantities).toEqual([
      { skuId: 'BP-1', ordered: 2, dispatched: 2, delivered: 0, returned: 0 },
    ])
  })

  it('reads the return window end', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      status: 'DELIVERED',
      returnWindowEndsAt: '2026-11-23T10:00:00Z',
      timeline: [],
      quantities: [],
    })
    expect(tracking.returnWindowEndsAt).toBe('2026-11-23T10:00:00Z')
    expect(tracking.status).toBe('DELIVERED')
  })

  it('drops entries it cannot read and falls back to the confirmed status', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      returnWindowEndsAt: 'soon',
      timeline: [
        { at: 'later', type: 'DELIVERED' },
        { at: '2026-11-15T10:00:00Z', type: 'LOST' },
        null,
      ],
    })
    expect(tracking.events).toEqual([])
    expect(tracking.status).toBe('CONFIRMED')
    expect(tracking.returnWindowEndsAt).toBeNull()
  })

  it('survives a response that is not an object', () => {
    expect(toOrderTracking(null)).toMatchObject({ orderId: '', events: [], quantities: [] })
  })
})

describe('toShipmentRow', () => {
  it('reads a row and derives the shipment id from the order when it is missing', () => {
    expect(
      toShipmentRow({
        orderId: 'O-001',
        warehouseId: 'WH-HCM-01',
        status: 'PICKING',
        items: [
          { skuId: 'BP-1', quantity: 2, pickedQuantity: 0, deliveredQuantity: 0 },
          { skuId: 'BT-1', quantity: 1, pickedQuantity: 0, deliveredQuantity: 0 },
        ],
        version: 2,
        createdAt: '2026-11-15T10:00:00Z',
      })
    ).toEqual({
      shipmentId: 'SHP-O-001',
      orderId: 'O-001',
      warehouseId: 'WH-HCM-01',
      status: 'PICKING',
      itemCount: 3,
      version: 2,
      createdAt: '2026-11-15T10:00:00Z',
    })
  })

  it('reads an unknown status as blocked so it can never be handed over', () => {
    expect(toShipmentRow({ shipmentId: 'SHP-O-1', status: 'TELEPORTED' }).status).toBe(
      'PICK_BLOCKED'
    )
  })
})

describe('toShipmentDetail', () => {
  it('reads the pick list, the dates and the failure reason', () => {
    const detail = toShipmentDetail({
      shipmentId: 'SHP-O-001',
      orderId: 'O-001',
      status: 'PICK_BLOCKED',
      failureReason: 'Damaged',
      handedOverAt: '2026-11-15T12:00:00Z',
      deliveredAt: '2026-11-16T12:00:00Z',
      returnWindowEndsAt: '2026-11-23T12:00:00Z',
      items: [
        { skuId: 'BP-1', quantity: 2, pickedQuantity: 1, deliveredQuantity: 0 },
        { skuId: 'BT-1', quantity: 1 },
      ],
    })
    expect(detail.itemCount).toBe(3)
    expect(detail.lines[1]).toEqual({ skuId: 'BT-1', orderedQuantity: 1, pickedQuantity: 0 })
    expect(detail).toMatchObject({
      failureReason: 'Damaged',
      handedOverAt: '2026-11-15T12:00:00Z',
      deliveredAt: '2026-11-16T12:00:00Z',
      returnWindowEndsAt: '2026-11-23T12:00:00Z',
    })
  })

  it('leaves the optional fields empty when the service sends none', () => {
    expect(
      toShipmentDetail({ shipmentId: 'SHP-O-1', status: 'PENDING_PICK', items: [] })
    ).toMatchObject({
      lines: [],
      handedOverAt: null,
      deliveredAt: null,
      returnWindowEndsAt: null,
      failureReason: null,
    })
  })
})
