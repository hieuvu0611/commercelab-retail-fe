import { createMockAddressState } from '@/addresses/mock-addresses'
import { createMockCartState } from '@/cart/mock-cart'
import { createMockCatalogState } from '@/catalog/mock-catalog'
import { createMockVoucherState } from '../mock-vouchers'
import { handleCheckoutMock, QUOTE_TTL_MS, type CheckoutMockDeps } from '../mock-checkout'

const SKU_A = 'BP-CITY-BLK-20L'
const SKU_B = 'BTL-INS-BLK-500'
const NOW = Date.parse('2026-11-15T10:00:00.000Z')

let deps: CheckoutMockDeps
let nowMs: number
beforeEach(() => {
  nowMs = NOW
  deps = {
    carts: createMockCartState(),
    catalog: createMockCatalogState(),
    addresses: createMockAddressState(),
    vouchers: createMockVoucherState(),
    quotes: { counter: 0 },
    now: () => nowMs,
  }
  deps.carts.carts.set(
    'u1',
    new Map([
      [SKU_A, 2],
      [SKU_B, 1],
    ])
  )
  deps.addresses.books.set('u1', [
    {
      id: 'addr-1',
      recipient: 'Lan',
      phone: '+84901234567',
      line1: 'x',
      ward: 'w',
      district: 'd',
      province: 'p',
      isDefault: true,
    },
  ])
})

const quote = (body: unknown, userId: string | null = 'u1') =>
  handleCheckoutMock({ method: 'POST', path: '/quotes', body }, userId, deps)
const data = (response: ReturnType<typeof quote>) =>
  (response?.body as { data: Record<string, unknown> & { lines: Array<Record<string, number>> } })
    .data

describe('mock quote', () => {
  it('ignores other requests and needs sign-in', () => {
    expect(handleCheckoutMock({ method: 'GET', path: '/products' }, 'u1', deps)).toBeNull()
    expect(quote({ addressId: 'addr-1' }, null)?.status).toBe(401)
  })

  it('SC01: prices the server cart with WELCOME10 to 660,000 and expires in five minutes', () => {
    const result = data(quote({ addressId: 'addr-1', voucherCode: 'welcome10' }))
    expect(result).toMatchObject({
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      totalPayableVnd: 660000,
      voucherCode: 'WELCOME10',
    })
    expect(result.lines.map((l) => l.lineDiscountVnd)).toEqual([60000, 10000])
    expect(Date.parse(result.expiresAt as string) - NOW).toBe(QUOTE_TTL_MS)
  })

  it('without a voucher charges shipping on the plain total', () => {
    expect(data(quote({ addressId: 'addr-1' }))).toMatchObject({
      discountVnd: 0,
      totalPayableVnd: 730000,
    })
  })

  it('gives a new quote id each time but the same version while nothing changed', () => {
    const first = data(quote({ addressId: 'addr-1' }))
    nowMs += 6 * 60 * 1000
    const second = data(quote({ addressId: 'addr-1' }))
    expect(second.quoteId).not.toBe(first.quoteId)
    expect(second.version).toBe(first.version)
  })

  it('changes the version when a price changes', () => {
    const before = data(quote({ addressId: 'addr-1' })).version
    const product = deps.catalog.products.find((p) => p.skus.some((s) => s.skuId === SKU_A))!
    product.skus.find((s) => s.skuId === SKU_A)!.unitPriceVnd = 310000
    const after = data(quote({ addressId: 'addr-1' }))
    expect(after.version).not.toBe(before)
    expect(after.totalPayableVnd).toBe(750000)
  })

  it.each([
    [{ addressId: 'addr-1', userId: 'x' }, 400],
    [{ addressId: 'addr-1', items: [] }, 400],
    [{}, 400],
    [{ addressId: 'nope' }, 422],
    [{ addressId: 'addr-1', voucherCode: 'NOPE' }, 422],
    [{ addressId: 'addr-1', voucherCode: 'SOLDOUT10' }, 422],
  ])('refuses %j with %i', (body, status) => {
    expect(quote(body)?.status).toBe(status)
  })

  it('answers the voucher reason as the error code', () => {
    expect(quote({ addressId: 'addr-1', voucherCode: 'SOLDOUT10' })?.body).toMatchObject({
      code: 'VOUCHER_EXHAUSTED',
    })
  })

  it('refuses an empty cart and a cart with a SKU that was unpublished', () => {
    deps.carts.carts.set('u2', new Map())
    deps.addresses.books.set('u2', deps.addresses.books.get('u1')!)
    expect(quote({ addressId: 'addr-1' }, 'u2')?.body).toMatchObject({ code: 'CART_EMPTY' })
    const product = deps.catalog.products.find((p) => p.skus.some((s) => s.skuId === SKU_A))!
    product.status = 'UNPUBLISHED'
    expect(quote({ addressId: 'addr-1' })).toMatchObject({
      status: 409,
      body: { code: 'SKU_NOT_ORDERABLE' },
    })
  })

  it("does not accept another customer's address", () => {
    deps.carts.carts.set('u3', new Map([[SKU_A, 1]]))
    expect(quote({ addressId: 'addr-1' }, 'u3')?.body).toMatchObject({ code: 'ADDRESS_NOT_FOUND' })
  })
})

describe('mock voucher eligibility endpoint', () => {
  it('answers code, eligible, reason and discountPct', () => {
    const response = handleCheckoutMock(
      { method: 'GET', path: '/vouchers/welcome10/eligibility' },
      'u1',
      deps
    )
    expect(response?.body).toMatchObject({
      data: { code: 'WELCOME10', eligible: true, reason: '', discountPct: 10 },
    })
  })
})
