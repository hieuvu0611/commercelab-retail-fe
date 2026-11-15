import { toOrderTracking, toShipmentDetail, toShipmentRow } from '../adapters'

describe('toOrderTracking', () => {
  it('sorts events oldest first and takes the status from the latest one', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      status: 'PACKING',
      events: [
        { time: '2026-11-16T09:00:00Z', label: 'On its way', status: 'IN_TRANSIT' },
        { time: '2026-11-15T10:00:00Z', label: 'Order confirmed', status: 'CONFIRMED' },
      ],
    })
    expect(tracking.events.map((event) => event.status)).toEqual(['CONFIRMED', 'IN_TRANSIT'])
    expect(tracking.status).toBe('IN_TRANSIT')
  })

  it('reads the failure reason and the return window end', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      returnWindowEndsAt: '2026-11-23T10:00:00Z',
      events: [
        {
          occurredAt: '2026-11-16T09:00:00Z',
          status: 'DELIVERY_FAILED',
          reason: 'Recipient not available',
        },
      ],
    })
    expect(tracking.events[0]).toMatchObject({
      time: '2026-11-16T09:00:00Z',
      reason: 'Recipient not available',
      label: '',
    })
    expect(tracking.returnWindowEndsAt).toBe('2026-11-23T10:00:00Z')
  })

  it('drops events it cannot read and falls back to the confirmed status', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      returnWindowEndsAt: 'soon',
      events: [
        { time: 'later', status: 'DELIVERED' },
        { time: '2026-11-15T10:00:00Z', status: 'LOST' },
        null,
      ],
    })
    expect(tracking.events).toEqual([])
    expect(tracking.status).toBe('CONFIRMED')
    expect(tracking.returnWindowEndsAt).toBeNull()
  })

  it('survives a response that is not an object', () => {
    expect(toOrderTracking(null)).toMatchObject({ orderId: '', events: [], carrier: null })
  })
})

describe('toShipmentRow', () => {
  it('reads a row and derives the shipment id from the order when it is missing', () => {
    expect(
      toShipmentRow({
        orderId: 'O-001',
        warehouseId: 'WH-HCM-01',
        status: 'PICKING',
        itemCount: 3,
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
  it('reads the pick list and totals the items when the count is missing', () => {
    const detail = toShipmentDetail({
      shipmentId: 'SHP-O-001',
      orderId: 'O-001',
      status: 'PICK_BLOCKED',
      shortageSkuId: 'BP-1',
      shortageReason: 'Damaged',
      lines: [
        { skuId: 'BP-1', skuName: 'Backpack', orderedQuantity: 2, pickedQuantity: 1 },
        { skuId: 'BT-1', quantity: 1 },
      ],
    })
    expect(detail.itemCount).toBe(3)
    expect(detail.lines[1]).toEqual({
      skuId: 'BT-1',
      skuName: 'BT-1',
      orderedQuantity: 1,
      pickedQuantity: 0,
    })
    expect(detail).toMatchObject({
      shortageSkuId: 'BP-1',
      shortageReason: 'Damaged',
      handedOverAt: null,
    })
  })
})
