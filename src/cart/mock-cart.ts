import { getMockCatalogState, type MockCatalogState } from '@/catalog/mock-catalog'
import { isOnShelf } from '@/catalog/mock-storefront'
import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { MAX_QUANTITY, MIN_QUANTITY } from '@/types/cart'
import { clampQuantity } from './quantity'

/** Cart part of the in-app mock backend (/mock-api). Mirrors the P4-T01 contract (see src/types/cart.ts). */

export interface MockCartState {
  /** SKU id to quantity, per user id; insertion order is the display order. */
  carts: Map<string, Map<string, number>>
}

export const createMockCartState = (): MockCartState => ({ carts: new Map() })

const globalForCart = globalThis as unknown as { __mockCartState?: MockCartState }

export function getMockCartState(): MockCartState {
  globalForCart.__mockCartState ??= createMockCartState()
  return globalForCart.__mockCartState
}

export interface SkuOffer {
  skuId: string
  name: string
  slug: string
  imageUrl: string | null
  attributes: Record<string, string>
  unitPriceVnd: number
  /** Published product, active SKU and a price. */
  isAvailable: boolean
}

/** Looks a SKU up in the catalogue; undefined when no product has it. */
export function findOffer(catalog: MockCatalogState, skuId: string): SkuOffer | undefined {
  for (const product of catalog.products) {
    const sku = product.skus.find((entry) => entry.skuId === skuId)
    if (!sku) continue
    return {
      skuId,
      name: product.name,
      slug: product.slug,
      imageUrl: product.images[0]?.url ?? null,
      attributes: sku.attributes,
      unitPriceVnd: sku.unitPriceVnd ?? 0,
      isAvailable: isOnShelf(product) && sku.isActive && sku.unitPriceVnd !== null,
    }
  }
  return undefined
}

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({
  status,
  body: { message, code, status, ...(errors && { errors }) },
})

export const cartOf = (state: MockCartState, userId: string): Map<string, number> => {
  const existing = state.carts.get(userId)
  if (existing) return existing
  const created = new Map<string, number>()
  state.carts.set(userId, created)
  return created
}

/** The cart with current server prices; lines whose SKU is no longer sellable are flagged, not dropped. */
export function cartView(catalog: MockCatalogState, cart: ReadonlyMap<string, number>) {
  const lines = [...cart].flatMap(([skuId, quantity]) => {
    const offer = findOffer(catalog, skuId)
    return offer
      ? [
          {
            skuId,
            quantity,
            skuName: offer.name,
            slug: offer.slug,
            imageUrl: offer.imageUrl,
            attributes: offer.attributes,
            unitPriceVnd: offer.unitPriceVnd,
            lineTotalVnd: offer.unitPriceVnd * quantity,
            isAvailable: offer.isAvailable,
          },
        ]
      : []
  })
  return {
    lines,
    subtotalVnd: lines.filter((l) => l.isAvailable).reduce((sum, l) => sum + l.lineTotalVnd, 0),
  }
}

const isQuantity = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MIN_QUANTITY &&
  value <= MAX_QUANTITY

/** Returns a response for a cart endpoint, or null when the request is not a cart request. */
export function handleCartMock(
  request: MockRequest,
  userId: string | null,
  state: MockCartState = getMockCartState(),
  catalog: MockCatalogState = getMockCatalogState()
): MockResponse | null {
  const { method, path } = request
  if (!path.startsWith('/carts/me')) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  const cart = cartOf(state, userId)
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}

  if (method === 'GET' && path === '/carts/me') return ok(cartView(catalog, cart))

  const item = path.match(/^\/carts\/me\/items\/([^/]+)$/)
  if (item) {
    const skuId = decodeURIComponent(item[1])
    if (method === 'PUT') {
      if (!isQuantity(body.quantity))
        return failure(422, 'VALIDATION_FAILED', 'Request validation failed', {
          quantity: [`Quantity must be a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}`],
        })
      if (!findOffer(catalog, skuId)?.isAvailable)
        return failure(422, 'SKU_UNAVAILABLE', 'This product is not available')
      cart.set(skuId, body.quantity)
      return ok(cartView(catalog, cart), 'Cart updated')
    }
    if (method === 'DELETE') {
      cart.delete(skuId)
      return ok(cartView(catalog, cart), 'Item removed')
    }
  }

  if (method === 'POST' && path === '/carts/me/merge') {
    const lines = Array.isArray(body.lines) ? body.lines : []
    const skipped: Array<{ skuId: string; reason: string }> = []
    for (const entry of lines) {
      const line =
        entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      const skuId = typeof line.skuId === 'string' ? line.skuId : ''
      if (!skuId || !isQuantity(line.quantity)) {
        skipped.push({ skuId, reason: 'INVALID_LINE' })
      } else if (!findOffer(catalog, skuId)?.isAvailable) {
        skipped.push({ skuId, reason: 'SKU_UNAVAILABLE' })
      } else {
        cart.set(skuId, clampQuantity((cart.get(skuId) ?? 0) + line.quantity))
      }
    }
    return ok({ ...cartView(catalog, cart), skipped }, 'Cart merged')
  }

  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
