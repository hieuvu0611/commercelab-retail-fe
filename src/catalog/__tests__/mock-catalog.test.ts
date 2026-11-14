import { createMockCatalogState, handleCatalogMock } from '../mock-catalog'

const get = (path: string) =>
  handleCatalogMock({ method: 'GET', path }, null, createMockCatalogState())

describe('mock catalogue categories', () => {
  it('serves the active tree with three levels under Backpacks', () => {
    const response = get('/categories')
    const tree = (
      response?.body as { data: { slug: string; children: { children: unknown[] }[] }[] }
    ).data
    expect(tree.map((node) => node.slug)).toEqual(['backpacks', 'bottles', 'travel-accessories'])
    expect(tree[0].children[0].children).toHaveLength(1)
  })

  it('serves one category by path', () => {
    const response = get('/categories/backpacks/city')
    expect(response?.status).toBe(200)
    expect((response?.body as { data: { path: string } }).data.path).toBe('backpacks/city')
  })

  it('answers 404 for an unknown path and null for other endpoints', () => {
    expect(get('/categories/nope')?.status).toBe(404)
    expect(get('/auth/me')).toBeNull()
  })
})

describe('mock storefront products', () => {
  const list = (query: Record<string, string>) => {
    const response = handleCatalogMock(
      { method: 'GET', path: '/products', query },
      null,
      createMockCatalogState()
    )
    const body = response?.body as {
      data: { slug: string; minPriceVnd: number }[]
      metadata: { total: number; page: number; pageCount: number; limit: number }
    }
    return body
  }

  it('lists only published priced products with real page metadata', () => {
    const { data, metadata } = list({})
    expect(metadata.total).toBe(25)
    expect(data).toHaveLength(12)
    expect(metadata).toMatchObject({ page: 1, pageCount: 3, limit: 12 })
    expect(list({ page: '3' }).data).toHaveLength(1)
  })

  it('includes descendant categories', () => {
    expect(list({ category: 'backpacks/city' }).data.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['city-backpack', 'slim-laptop-pack-15'])
    )
    expect(list({ category: 'bottles' }).metadata.total).toBe(6)
  })

  it('filters by colour and price and sorts by price', () => {
    const result = list({
      category: 'travel-accessories/locks',
      'attr.color': 'Red',
      minPrice: '50000',
      sort: 'price_asc',
    })
    expect(result.data.map((p) => p.slug)).toEqual([
      'zipper-lock-pair',
      'combination-padlock',
      'tsa-cable-lock',
    ])
  })

  it('treats a regex-looking search as plain text', () => {
    expect(list({ q: '.*' }).metadata.total).toBe(0)
    expect(list({ q: 'passport' }).data.map((p) => p.slug)).toEqual(['passport-pouch'])
  })

  it('serves detail for a published product and 404 for a draft', () => {
    const get = (slug: string) =>
      handleCatalogMock(
        { method: 'GET', path: `/products/${slug}` },
        null,
        createMockCatalogState()
      )
    expect(get('city-backpack')?.status).toBe(200)
    expect(get('canvas-tote-draft')?.status).toBe(404)
  })
})
