import { createMockCatalogState, handleCatalogMock } from '../mock-catalog'
import { today } from '../mock-price-admin'

const state = () => createMockCatalogState()
const call = (
  s: ReturnType<typeof state>,
  roles: string[] | null,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
) => {
  const r = handleCatalogMock({ method, path, body, query }, roles, s)!
  return {
    status: r.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(r.body as { data?: any; code?: string; errors?: Record<string, string[]> }),
  }
}
const MKT = ['MARKETING']
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

describe('admin prices', () => {
  it('is for MARKETING only', () => {
    const s = state()
    expect(call(s, null, 'GET', '/admin/prices').status).toBe(401)
    expect(call(s, ['PRODUCT_STAFF'], 'GET', '/admin/prices').status).toBe(403)
    expect(call(s, MKT, 'GET', '/admin/prices').status).toBe(200)
  })

  it('lists SKU prices with search', () => {
    const rows = call(state(), MKT, 'GET', '/admin/prices', undefined, {
      q: 'BP-CITY-BLK-20L',
    }).data
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ skuId: 'BP-CITY-BLK-20L', unitPriceVnd: 300000 })
  })

  it('rejects non-integer, non-positive prices and bad dates', () => {
    const s = state()
    const put = (body: unknown) => call(s, MKT, 'PUT', '/admin/skus/BP-CITY-BLK-20L/price', body)
    expect(put({ unitPriceVnd: 100.5, effectiveFrom: today() }).errors?.unitPriceVnd).toBeDefined()
    expect(put({ unitPriceVnd: 0, effectiveFrom: today() }).status).toBe(422)
    expect(put({ unitPriceVnd: 1000, effectiveFrom: 'soon' }).errors?.effectiveFrom).toBeDefined()
    expect(
      call(s, MKT, 'PUT', '/admin/skus/NOPE/price', { unitPriceVnd: 1, effectiveFrom: today() })
        .status
    ).toBe(404)
  })

  it('applies a price that has started and keeps a future price scheduled', () => {
    const s = state()
    const put = (price: number, from: string) =>
      call(s, MKT, 'PUT', '/admin/skus/BP-CITY-BLK-20L/price', {
        unitPriceVnd: price,
        effectiveFrom: from,
      })
    expect(put(310000, today()).data.unitPriceVnd).toBe(310000)
    expect(put(350000, day(7)).data.unitPriceVnd).toBe(310000)
    const history = call(s, MKT, 'GET', '/admin/skus/BP-CITY-BLK-20L/price').data
    expect(history.map((h: { unitPriceVnd: number }) => h.unitPriceVnd)).toEqual([
      300000, 310000, 350000,
    ])
    expect(history[1].effectiveTo).toBe(day(7))
    expect(history[2].effectiveTo).toBeNull()
  })

  it('gives a SKU without a price its first price so the product can publish', () => {
    const s = state()
    const row = call(s, MKT, 'PUT', '/admin/skus/CANVAS-TOTE-DRAFT-SAND-15-L/price', {
      unitPriceVnd: 200000,
      effectiveFrom: today(),
    }).data
    expect(row.unitPriceVnd).toBe(200000)
    expect(s.products.find((p) => p.slug === 'canvas-tote-draft')!.skus[0].unitPriceVnd).toBe(
      200000
    )
  })
})
