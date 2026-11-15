import { createMockCatalogState } from '@/catalog/mock-catalog'
import { createMockCartState, handleCartMock } from '../mock-cart'

const catalog = createMockCatalogState()
const state = createMockCartState()
const call = (method: string, path: string, body?: unknown, userId: string | null = 'u1') =>
  handleCartMock({ method, path, body }, userId, state, catalog)

const SKU_A = 'BP-CITY-BLK-20L'
const SKU_B = 'BTL-INS-BLK-500'

describe('mock cart API', () => {
  it('ignores other paths and needs a signed-in user', () => {
    expect(call('GET', '/products')).toBeNull()
    expect(call('GET', '/carts/me', undefined, null)?.status).toBe(401)
  })

  it('starts empty and prices lines from the catalogue', () => {
    expect(call('GET', '/carts/me', undefined, 'fresh')?.body).toMatchObject({
      data: { lines: [], subtotalVnd: 0 },
    })
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 2 })
    const response = call('PUT', `/carts/me/items/${SKU_B}`, { quantity: 1 })
    expect(response?.body).toMatchObject({ data: { subtotalVnd: 700000 } })
  })

  it('sets rather than adds, and keeps carts per user', () => {
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 5 }, 'u2')
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 3 }, 'u2')
    const own = call('GET', '/carts/me', undefined, 'u2')?.body as {
      data: { lines: Array<{ quantity: number }> }
    }
    expect(own.data.lines[0].quantity).toBe(3)
    const other = call('GET', '/carts/me', undefined, 'u3')?.body as { data: { lines: unknown[] } }
    expect(other.data.lines).toHaveLength(0)
  })

  it.each([0, 100, 1.5, '2', undefined])('rejects quantity %p', (quantity) => {
    const response = call('PUT', `/carts/me/items/${SKU_A}`, { quantity })
    expect(response?.status).toBe(422)
    expect(response?.body).toMatchObject({ errors: { quantity: expect.any(Array) } })
  })

  it('refuses unknown, unpublished or inactive SKUs', () => {
    expect(call('PUT', '/carts/me/items/NOPE', { quantity: 1 })?.body).toMatchObject({
      code: 'SKU_UNAVAILABLE',
    })
    const draft = catalog.products.find((product) => product.status !== 'PUBLISHED')
    if (draft)
      expect(call('PUT', `/carts/me/items/${draft.skus[0].skuId}`, { quantity: 1 })?.status).toBe(
        422
      )
  })

  it('removes a line and is idempotent', () => {
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 1 }, 'u4')
    call('DELETE', `/carts/me/items/${SKU_A}`, undefined, 'u4')
    const response = call('DELETE', `/carts/me/items/${SKU_A}`, undefined, 'u4')
    expect(response?.status).toBe(200)
    expect(response?.body).toMatchObject({ data: { lines: [] } })
  })

  it('merges guest lines by summing, capping at 99 and skipping unavailable SKUs', () => {
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 98 }, 'u5')
    const response = call(
      'POST',
      '/carts/me/merge',
      {
        lines: [
          { skuId: SKU_A, quantity: 5 },
          { skuId: SKU_B, quantity: 1 },
          { skuId: 'NOPE', quantity: 1 },
          { skuId: SKU_B, quantity: 500 },
        ],
      },
      'u5'
    )
    const data = (
      response?.body as {
        data: {
          lines: Array<{ skuId: string; quantity: number }>
          skipped: Array<{ skuId: string; reason: string }>
        }
      }
    ).data
    expect(data.lines.find((l) => l.skuId === SKU_A)?.quantity).toBe(99)
    expect(data.lines.find((l) => l.skuId === SKU_B)?.quantity).toBe(1)
    expect(data.skipped.map((s) => s.reason)).toEqual(['SKU_UNAVAILABLE', 'INVALID_LINE'])
  })

  it('flags a line whose SKU was unpublished after it was added', () => {
    call('PUT', `/carts/me/items/${SKU_A}`, { quantity: 1 }, 'u6')
    const product = catalog.products.find((p) => p.skus.some((s) => s.skuId === SKU_A))!
    product.status = 'UNPUBLISHED'
    const view = call('GET', '/carts/me', undefined, 'u6')?.body as {
      data: { lines: Array<{ isAvailable: boolean }>; subtotalVnd: number }
    }
    product.status = 'PUBLISHED'
    expect(view.data.lines[0].isAvailable).toBe(false)
    expect(view.data.subtotalVnd).toBe(0)
  })
})
