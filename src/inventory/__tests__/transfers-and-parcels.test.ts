import { toOrderTracking, toShipmentRow } from '@/fulfillment/adapters'
import { listOrderShipments, listShipments } from '@/fulfillment/shipments-api'
import { listStaffOrders } from '@/orders/staff-orders-api'
import { storefrontApi } from '@/services/api/clients'
import {
  createTransfer,
  dispatchTransfer,
  listTransfers,
  receiveTransfer,
} from '@/inventory/transfers-api'

describe('Module 2 Multi-Warehouse & Multi-Parcel', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_MOCK_MODE
  })

  it('adapts multi-parcel order tracking payload with PARTIALLY_DELIVERED status', () => {
    const tracking = toOrderTracking({
      orderId: 'ORD-MULTI-1',
      status: 'PARTIALLY_DELIVERED',
      paymentMethod: 'COD',
      codAmountToCollect: 450000,
      quantities: [
        { skuId: 'SKU-A', ordered: 1, dispatched: 1, delivered: 1, returned: 0 },
        { skuId: 'SKU-B', ordered: 2, dispatched: 2, delivered: 0, returned: 0 },
      ],
      timeline: [
        { time: '2026-11-17T08:00:00Z', status: 'CONFIRMED', label: 'Confirmed' },
        { time: '2026-11-17T10:00:00Z', status: 'PARTIALLY_DELIVERED', label: 'Parcel 1 delivered' },
      ],
      parcels: [
        {
          shipmentId: 'SHP-ORD-MULTI-1-2',
          warehouseId: 'WH-HN-01',
          parcelIndex: 2,
          totalParcels: 2,
          status: 'IN_TRANSIT',
          paymentMethod: 'COD',
          codAmountToCollect: 300000,
          quantities: [{ skuId: 'SKU-B', ordered: 2, dispatched: 2, delivered: 0, returned: 0 }],
          timeline: [],
        },
        {
          shipmentId: 'SHP-ORD-MULTI-1-1',
          warehouseId: 'WH-HCM-01',
          parcelIndex: 1,
          totalParcels: 2,
          status: 'DELIVERED',
          paymentMethod: 'COD',
          codAmountToCollect: 150000,
          quantities: [{ skuId: 'SKU-A', ordered: 1, dispatched: 1, delivered: 1, returned: 0 }],
          timeline: [{ time: '2026-11-17T10:00:00Z', status: 'DELIVERED', label: 'Delivered' }],
        },
      ],
    })

    expect(tracking.status).toBe('PARTIALLY_DELIVERED')
    expect(tracking.parcels).toHaveLength(2)
    expect(tracking.parcels?.[0].shipmentId).toBe('SHP-ORD-MULTI-1-1')
    expect(tracking.parcels?.[0].parcelIndex).toBe(1)
    expect(tracking.parcels?.[1].warehouseId).toBe('WH-HN-01')
    expect(tracking.parcels?.[1].codAmountToCollect).toBe(300000)
  })

  it('adapts parcelIndex and totalParcels on ShipmentRow', () => {
    const row = toShipmentRow({
      shipmentId: 'SHP-ORD-9-2',
      orderId: 'ORD-9',
      warehouseId: 'WH-HN-01',
      parcelIndex: 2,
      totalParcels: 2,
      status: 'PACKED',
      items: [{ skuId: 'SKU-B', quantity: 2 }],
      version: 3,
      createdAt: '2026-11-17T08:00:00Z',
    })

    expect(row.parcelIndex).toBe(2)
    expect(row.totalParcels).toBe(2)
    expect(row.itemCount).toBe(2)
  })

  it('routes admin shipments, order parcels, and staff orders through storefrontApi gateway', async () => {
    const getSpy = jest.spyOn(storefrontApi, 'get').mockResolvedValue({
      data: [],
      metadata: { total: 0, pageCount: 1 },
    } as never)

    await listShipments({ status: '', page: 1, limit: 10 })
    await listOrderShipments('ORD-123')
    await listStaffOrders({ status: '', page: 1, limit: 10 })

    expect(getSpy).toHaveBeenNthCalledWith(1, '/admin/shipments', { params: { page: 1, limit: 10 } })
    expect(getSpy).toHaveBeenNthCalledWith(2, '/admin/orders/ORD-123/shipments')
    expect(getSpy).toHaveBeenNthCalledWith(3, '/admin/orders', { params: { page: 1, limit: 10 } })
  })

  it('creates, dispatches, and receives transfer with SC09 discrepancy in mock mode', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const created = await createTransfer({
      fromWarehouseId: 'WH-HCM-01',
      toWarehouseId: 'WH-HN-01',
      items: [{ skuId: 'SKU-BALO-BLACK-20L', quantity: 4 }],
      notes: 'North stock rebalance',
    })
    expect(created.status).toBe('DRAFT')

    const dispatched = await dispatchTransfer(created.transferId)
    expect(dispatched.status).toBe('IN_TRANSIT')

    const received = await receiveTransfer(created.transferId, [
      { skuId: 'SKU-BALO-BLACK-20L', receivedGoodQty: 3, damagedQty: 1, missingQty: 0 },
    ])
    expect(received.status).toBe('RECEIVED_WITH_DISCREPANCY')
    expect(received.exceptionCaseId).toBeTruthy()

    const list = await listTransfers()
    expect(list.some((t) => t.transferId === created.transferId)).toBe(true)
  })
})
