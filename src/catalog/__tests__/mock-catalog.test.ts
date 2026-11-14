import { createMockCatalogState, handleCatalogMock } from '../mock-catalog'

const get = (path: string) => handleCatalogMock({ method: 'GET', path }, createMockCatalogState())

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
