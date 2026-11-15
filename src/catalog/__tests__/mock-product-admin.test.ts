import { createMockCatalogState, handleCatalogMock } from '../mock-catalog'

const STAFF = ['PRODUCT_STAFF']

function setup() {
  const state = createMockCatalogState()
  const call = (method: string, path: string, body?: unknown, query?: Record<string, string>) => {
    const response = handleCatalogMock({ method, path, body, query }, STAFF, state)!
    return {
      status: response.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(response.body as { data?: any; code?: string; errors?: Record<string, string[]> }),
    }
  }
  return { state, call }
}

describe('admin products', () => {
  it('requires PRODUCT_STAFF', () => {
    const { state } = setup()
    expect(handleCatalogMock({ method: 'GET', path: '/admin/products' }, null, state)?.status).toBe(
      401
    )
    expect(
      handleCatalogMock({ method: 'GET', path: '/admin/products' }, ['MARKETING'], state)?.status
    ).toBe(403)
  })

  it('lists with search, status filter and page metadata', () => {
    const { call } = setup()
    const all = handleCatalogMock(
      { method: 'GET', path: '/admin/products', query: { limit: '10' } },
      STAFF,
      createMockCatalogState()
    )!
    expect((all.body as { metadata: { total: number; pageCount: number } }).metadata).toMatchObject(
      { total: 27, pageCount: 3 }
    )
    expect(call('GET', '/admin/products', undefined, { status: 'DRAFT' }).data).toHaveLength(1)
    expect(call('GET', '/admin/products', undefined, { q: 'padlock' }).data[0].name).toBe(
      'Combination Padlock'
    )
  })

  it('creates a draft with a unique slug and rejects a blank name', () => {
    const { call } = setup()
    expect(call('POST', '/admin/products', { name: ' ' }).status).toBe(422)
    const first = call('POST', '/admin/products', { name: 'City Backpack' })
    expect(first).toMatchObject({
      status: 201,
      data: { slug: 'city-backpack-2', status: 'DRAFT', version: 1 },
    })
  })

  it('answers 409 VERSION_CONFLICT for a stale version and bumps the version otherwise', () => {
    const { call } = setup()
    const created = call('POST', '/admin/products', { name: 'Tote' }).data
    const saved = call('PATCH', `/admin/products/${created.id}`, {
      version: 1,
      description: 'Soft',
    })
    expect(saved.data.version).toBe(2)
    const stale = call('PATCH', `/admin/products/${created.id}`, {
      version: 1,
      description: 'Other',
    })
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
  })

  it('validates SKUs: global code, complete attributes, unique combination', () => {
    const { call } = setup()
    const { id } = call('POST', '/admin/products', { name: 'Tote' }).data
    expect(call('POST', `/admin/products/${id}/skus`, { skuId: 'X', attributes: {} }).status).toBe(
      422
    )
    call('PATCH', `/admin/products/${id}`, { variantAxes: ['color'] })
    expect(
      call('POST', `/admin/products/${id}/skus`, { skuId: 'X', attributes: {} }).errors?.attributes
    ).toBeDefined()
    expect(
      call('POST', `/admin/products/${id}/skus`, {
        skuId: 'tote-red',
        attributes: { color: 'Red' },
      }).status
    ).toBe(201)
    expect(
      call('POST', `/admin/products/${id}/skus`, {
        skuId: 'TOTE-RED',
        attributes: { color: 'Blue' },
      }).code
    ).toBe('SKU_CODE_CONFLICT')
    expect(
      call('POST', `/admin/products/${id}/skus`, { skuId: 'TOTE-R2', attributes: { color: 'Red' } })
        .code
    ).toBe('SKU_COMBINATION_CONFLICT')
    expect(
      call('POST', `/admin/products/${id}/skus`, {
        skuId: 'BP-CITY-BLK-20L',
        attributes: { color: 'Blue' },
      }).code
    ).toBe('SKU_CODE_CONFLICT')
    expect(call('PATCH', `/admin/products/${id}`, { variantAxes: ['size'] }).code).toBe(
      'VARIANT_AXES_LOCKED'
    )
  })

  it('validates image uploads and keeps the order the staff chose', () => {
    const { call } = setup()
    const { id } = call('POST', '/admin/products', { name: 'Tote' }).data
    const url = `/admin/products/${id}/images/upload-url`
    expect(
      call('POST', url, { contentType: 'image/gif', sizeBytes: 10 }).errors?.contentType
    ).toBeDefined()
    expect(
      call('POST', url, { contentType: 'image/png', sizeBytes: 6 * 1024 * 1024 }).errors?.sizeBytes
    ).toBeDefined()
    const upload = call('POST', url, {
      contentType: 'image/png',
      sizeBytes: 1000,
    }).data
    const withOne = call('POST', `/admin/products/${id}/images`, { key: upload.objectKey }).data
    const withTwo = call('POST', `/admin/products/${id}/images`, {
      key: upload.objectKey,
      version: withOne.version,
    }).data
    const [a, b] = withTwo.images.map((image: { id: string }) => image.id)
    const reordered = call('PUT', `/admin/products/${id}/images/order`, { imageIds: [b, a] }).data
    expect(reordered.images.map((image: { id: string }) => image.id)).toEqual([b, a])
  })

  it('walks the workflow and lists every publish problem field by field', () => {
    const { call } = setup()
    const { id } = call('POST', '/admin/products', { name: 'Tote' }).data
    expect(call('POST', `/admin/products/${id}/publish`, {}).code).toBe('INVALID_STATE')
    expect(call('POST', `/admin/products/${id}/submit-review`, {}).data.status).toBe('IN_REVIEW')
    expect(call('PATCH', `/admin/products/${id}`, { name: 'Tote 2' }).code).toBe(
      'PRODUCT_NOT_EDITABLE'
    )
    const blocked = call('POST', `/admin/products/${id}/publish`, {})
    expect(blocked).toMatchObject({ status: 422, code: 'PUBLISH_VALIDATION_FAILED' })
    expect(Object.keys(blocked.errors!).sort()).toEqual([
      'description',
      'images',
      'primaryCategoryId',
      'skus',
    ])
    expect(call('POST', `/admin/products/${id}/reject`, {}).errors?.reason).toBeDefined()
    expect(
      call('POST', `/admin/products/${id}/reject`, { reason: 'Needs photos' }).data
    ).toMatchObject({ status: 'DRAFT', rejectionReason: 'Needs photos' })
  })

  it('publishes a complete product, shows it in the storefront, and unpublish hides it', () => {
    const { state, call } = setup()
    const draft = state.products.find((product) => product.slug === 'canvas-tote-draft')!
    const priced = {
      ...draft,
      skus: draft.skus.map((sku) => ({ ...sku, unitPriceVnd: 200000 })),
    }
    state.products = state.products.map((product) => (product.id === draft.id ? priced : product))
    call('POST', `/admin/products/${draft.id}/submit-review`, {})
    expect(call('POST', `/admin/products/${draft.id}/publish`, {}).data.status).toBe('PUBLISHED')
    const storefront = handleCatalogMock(
      { method: 'GET', path: '/products/canvas-tote-draft' },
      null,
      state
    )
    expect(storefront?.status).toBe(200)
    call('POST', `/admin/products/${draft.id}/unpublish`, {})
    expect(
      handleCatalogMock({ method: 'GET', path: '/products/canvas-tote-draft' }, null, state)?.status
    ).toBe(404)
  })
})
