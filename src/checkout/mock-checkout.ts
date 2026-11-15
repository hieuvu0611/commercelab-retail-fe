import { findAddress, getMockAddressState, type MockAddressState } from '@/addresses/mock-addresses'
import { cartOf, findOffer, getMockCartState, type MockCartState } from '@/cart/mock-cart'
import { getMockCatalogState, type MockCatalogState } from '@/catalog/mock-catalog'
import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { calculateQuote } from './quote-math'
import {
  checkEligibility,
  getMockVoucherState,
  normalizeCode,
  type MockVoucherState,
} from './mock-vouchers'

/** Voucher check and quote parts of the in-app mock backend (/mock-api). Mirrors P4-T03 and P4-T05. */

export const QUOTE_TTL_MS = 5 * 60 * 1000

export interface MockQuoteState {
  counter: number
}

const globalForQuotes = globalThis as unknown as { __mockQuoteState?: MockQuoteState }

export function getMockQuoteState(): MockQuoteState {
  globalForQuotes.__mockQuoteState ??= { counter: 0 }
  return globalForQuotes.__mockQuoteState
}

export interface CheckoutMockDeps {
  carts: MockCartState
  catalog: MockCatalogState
  addresses: MockAddressState
  vouchers: MockVoucherState
  quotes: MockQuoteState
  now: () => number
}

const defaultDeps = (): CheckoutMockDeps => ({
  carts: getMockCartState(),
  catalog: getMockCatalogState(),
  addresses: getMockAddressState(),
  vouchers: getMockVoucherState(),
  quotes: getMockQuoteState(),
  now: Date.now,
})

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

/** A short fingerprint of everything the customer accepts: lines, prices, voucher, address and totals. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

const QUOTE_FIELDS = new Set(['addressId', 'voucherCode'])

/** Returns a response for a voucher check or quote endpoint, or null for any other request. */
export function handleCheckoutMock(
  request: MockRequest,
  userId: string | null,
  deps: CheckoutMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const eligibility = path.match(/^\/vouchers\/([^/]+)\/eligibility$/)
  const isQuote = method === 'POST' && path === '/quotes'
  if (!(method === 'GET' && eligibility) && !isQuote) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  if (eligibility) {
    return ok(
      checkEligibility(deps.vouchers, decodeURIComponent(eligibility[1]), userId, deps.now())
    )
  }

  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  // The identity, items and prices come from the server, never from the client.
  const unknown = Object.keys(body).filter((key) => !QUOTE_FIELDS.has(key))
  if (unknown.length > 0)
    return failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', {
      [unknown[0]]: ['Unknown field'],
    })
  if (typeof body.addressId !== 'string' || !body.addressId)
    return failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', {
      addressId: ['addressId is required'],
    })

  const cart = cartOf(deps.carts, userId)
  if (cart.size === 0) return failure(409, 'CART_EMPTY', 'Your cart is empty')
  const offers = [...cart].map(([skuId, quantity]) => ({
    offer: findOffer(deps.catalog, skuId),
    quantity,
  }))
  if (offers.some(({ offer }) => !offer?.isAvailable))
    return failure(409, 'SKU_NOT_ORDERABLE', 'An item in your cart cannot be ordered right now')

  if (!findAddress(deps.addresses, userId, body.addressId))
    return failure(422, 'ADDRESS_NOT_FOUND', 'Address not found')

  let voucherCode: string | null = null
  let discountPct = 0
  if (typeof body.voucherCode === 'string' && body.voucherCode.trim()) {
    const result = checkEligibility(deps.vouchers, body.voucherCode, userId, deps.now())
    if (!result.eligible) return failure(422, result.reason, result.reason)
    voucherCode = normalizeCode(body.voucherCode)
    discountPct = result.discountPct
  }

  const totals = calculateQuote(
    offers.map(({ offer, quantity }) => ({
      skuId: offer!.skuId,
      skuName: `${offer!.name} (${Object.values(offer!.attributes).join(' / ')})`,
      quantity,
      unitPriceVnd: offer!.unitPriceVnd,
    })),
    discountPct
  )
  deps.quotes.counter += 1
  const quote = {
    quoteId: `quote-${deps.quotes.counter}`,
    userId,
    addressId: body.addressId,
    voucherCode,
    discountPct,
    ...totals,
    expiresAt: new Date(deps.now() + QUOTE_TTL_MS).toISOString(),
  }
  return ok(
    {
      ...quote,
      version: fingerprint({
        addressId: quote.addressId,
        voucherCode,
        discountPct,
        lines: totals.lines,
        totalPayableVnd: totals.totalPayableVnd,
      }),
    },
    'Quote created',
    201
  )
}
