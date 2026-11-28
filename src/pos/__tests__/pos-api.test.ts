import { setAccessToken } from '@/auth/access-token'
import { createMockPosSale, listMockPosSales, resetMockPosStore } from '@/pos/mock-pos'
import {
  PosApiError,
  createPosSale,
  listPosSales,
  searchPosCatalog,
} from '@/pos/pos-api'

const originalMockMode = process.env.NEXT_PUBLIC_MOCK_MODE
const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
const originalFetch = global.fetch

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  resetMockPosStore()
  setAccessToken(null)
  process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8080/api/v1'
})

afterAll(() => {
  process.env.NEXT_PUBLIC_MOCK_MODE = originalMockMode
  process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl
  global.fetch = originalFetch
})

describe('pos-api HTTP client', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
  })

  it('sends Idempotency-Key and Authorization headers on createPosSale', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(201, {
        message: 'POS sale recorded',
        data: {
          orderId: 'ord-pos-001',
          receiptNumber: 'POS-HCM-001',
          channel: 'POS',
          warehouseId: 'WH-HCM-01',
          cashierId: 'usr-1',
          paymentMethod: 'POS_CASH',
          paymentStatus: 'COLLECTED',
          status: 'DELIVERY_COMPLETE',
          subtotalVnd: 300000,
          totalVnd: 300000,
          cashReceivedVnd: 500000,
          changeDueVnd: 200000,
          items: [
            {
              skuId: 'BP-CITY-BLK-20L',
              name: 'City Backpack 20L',
              quantity: 1,
              unitPriceVnd: 300000,
              lineTotalVnd: 300000,
            },
          ],
          createdAt: '2026-11-23T14:00:00Z',
        },
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const receipt = await createPosSale(
      {
        warehouseId: 'WH-HCM-01',
        paymentMethod: 'POS_CASH',
        cashReceivedVnd: 500000,
        items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 1 }],
      },
      'idem-key-123',
      'staff-jwt-token'
    )

    expect(receipt.receiptNumber).toBe('POS-HCM-001')
    expect(receipt.changeDueVnd).toBe(200000)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/admin/pos/sales',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer staff-jwt-token',
          'Idempotency-Key': 'idem-key-123',
        }),
      })
    )
  })

  it('maps 409 INSUFFICIENT_STOCK into PosApiError', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(409, {
        code: 'INSUFFICIENT_STOCK',
        message: 'Insufficient stock for BP-CITY-BLK-20L in WH-HCM-01',
      })
    ) as unknown as typeof fetch

    await expect(
      createPosSale(
        {
          warehouseId: 'WH-HCM-01',
          paymentMethod: 'POS_CARD',
          items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 999 }],
        },
        'idem-key-409',
        'staff-jwt-token'
      )
    ).rejects.toMatchObject({
      name: 'PosApiError',
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock for BP-CITY-BLK-20L in WH-HCM-01',
    })
  })

  it('maps 403 WAREHOUSE_SCOPE_DENIED into PosApiError on listPosSales', async () => {
    setAccessToken('fallback-token')
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(403, {
        code: 'WAREHOUSE_SCOPE_DENIED',
        message: 'Caller is not allowed to query WH-HN-01',
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    let caught: unknown
    try {
      await listPosSales('WH-HN-01')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PosApiError)
    expect(caught).toMatchObject({
      status: 403,
      code: 'WAREHOUSE_SCOPE_DENIED',
      message: 'Caller is not allowed to query WH-HN-01',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/admin/pos/sales?warehouseId=WH-HN-01',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer fallback-token',
        }),
      })
    )
  })

  it('queries storefront products endpoint for searchPosCatalog', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            id: 'prod-1',
            slug: 'city-backpack-20l',
            name: 'City Backpack 20L',
            minPriceVnd: 300000,
            skus: [{ skuId: 'BP-CITY-BLK-20L', unitPriceVnd: 300000, isActive: true }],
          },
        ],
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const items = await searchPosCatalog('backpack', 'staff-jwt-token')
    expect(items).toEqual([
      {
        skuId: 'BP-CITY-BLK-20L',
        name: 'City Backpack 20L',
        unitPriceVnd: 300000,
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/products?limit=12&q=backpack',
      expect.objectContaining({ method: 'GET' })
    )
  })
})

describe('pos-api mock mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  })

  it('replays the original receipt on duplicate Idempotency-Key without double-deducting stock', async () => {
    const beforeCatalog = await searchPosCatalog('BP-CITY-BLK-20L')
    const initialStock = beforeCatalog[0].availableByWarehouse?.['WH-HCM-01'] ?? 0

    const first = await createPosSale(
      {
        warehouseId: 'WH-HCM-01',
        paymentMethod: 'POS_CASH',
        cashReceivedVnd: 700000,
        items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 2 }],
      },
      'mock-idem-001'
    )
    const replay = await createPosSale(
      {
        warehouseId: 'WH-HCM-01',
        paymentMethod: 'POS_CASH',
        cashReceivedVnd: 700000,
        items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 2 }],
      },
      'mock-idem-001'
    )

    expect(replay).toEqual(first)
    expect(first.totalVnd).toBe(600000)
    expect(first.changeDueVnd).toBe(100000)

    const afterCatalog = await searchPosCatalog('BP-CITY-BLK-20L')
    expect(afterCatalog[0].availableByWarehouse?.['WH-HCM-01']).toBe(initialStock - 2)

    const sales = await listPosSales('WH-HCM-01')
    expect(sales.filter((sale) => sale.orderId === first.orderId)).toHaveLength(1)
  })

  it('rejects POS_CASH when cashReceivedVnd is less than totalVnd', async () => {
    await expect(
      createPosSale(
        {
          warehouseId: 'WH-HCM-01',
          paymentMethod: 'POS_CASH',
          cashReceivedVnd: 200000,
          items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 1 }],
        },
        'mock-idem-low-cash'
      )
    ).rejects.toMatchObject({
      status: 400,
      code: 'INSUFFICIENT_CASH_TENDERED',
    })
  })

  it('rejects sales exceeding available warehouse stock with 409 INSUFFICIENT_STOCK', async () => {
    await expect(
      createPosSale(
        {
          warehouseId: 'WH-HN-01',
          paymentMethod: 'POS_CARD',
          items: [{ skuId: 'ACC-PACK-ORG-M', quantity: 99 }],
        },
        'mock-idem-oos'
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
    })
  })

  it('enforces single-warehouse scope in mock store', () => {
    expect(() =>
      createMockPosSale(
        {
          warehouseId: 'WH-HN-01',
          paymentMethod: 'POS_CARD',
          items: [{ skuId: 'BP-CITY-BLK-20L', quantity: 1 }],
        },
        'mock-idem-scope',
        { allowedWarehouseScopes: ['WH-HCM-01'] }
      )
    ).toThrow(PosApiError)

    expect(() => listMockPosSales('WH-HN-01', ['WH-HCM-01'])).toThrow(
      expect.objectContaining({ status: 403, code: 'WAREHOUSE_SCOPE_DENIED' })
    )
  })
})
