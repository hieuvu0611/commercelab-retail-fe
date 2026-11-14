import { createMockCatalogState, handleCatalogMock, type MockCatalogState } from '../mock-catalog'
import {
  CatalogError,
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
} from '../mock-category-admin'

const pathOf = (state: MockCatalogState, id: string) =>
  state.categories.find((n) => n.id === id)?.path

function catchError(action: () => unknown): CatalogError {
  try {
    action()
  } catch (error) {
    if (error instanceof CatalogError) return error
    throw error
  }
  throw new Error('expected a CatalogError')
}

describe('category rules', () => {
  it('creates a category under a parent with a derived path', () => {
    const state = createMockCatalogState()
    const created = createCategory(state, { name: 'Rain gear', parentId: 'cat-hiking' })
    expect(created).toMatchObject({ path: 'backpacks/hiking/rain-gear', depth: 3, isActive: true })
  })

  it('rejects a fourth level, a duplicate sibling name and an empty name', () => {
    const state = createMockCatalogState()
    expect(
      catchError(() => createCategory(state, { name: 'Deep', parentId: 'cat-laptop' }))
    ).toMatchObject({
      status: 422,
      errors: { parentId: expect.any(Array) },
    })
    expect(
      catchError(() => createCategory(state, { name: 'city', parentId: 'cat-backpacks' }))
    ).toMatchObject({
      status: 409,
      code: 'CATEGORY_SLUG_CONFLICT',
    })
    expect(catchError(() => createCategory(state, { name: '  ' })).errors?.name).toBeDefined()
  })

  it('moves a subtree and recomputes every path and depth', () => {
    const state = createMockCatalogState()
    moveCategory(state, 'cat-city', { parentId: 'cat-bottles' })
    expect(pathOf(state, 'cat-city')).toBe('bottles/city')
    expect(pathOf(state, 'cat-laptop')).toBe('bottles/city/laptop')
    expect(state.categories.find((n) => n.id === 'cat-laptop')?.depth).toBe(3)
  })

  it('rejects moving a category under itself or its own child', () => {
    const state = createMockCatalogState()
    expect(
      catchError(() => moveCategory(state, 'cat-backpacks', { parentId: 'cat-laptop' })).code
    ).toBe('CATEGORY_CYCLE')
    expect(catchError(() => moveCategory(state, 'cat-city', { parentId: 'cat-city' })).code).toBe(
      'CATEGORY_CYCLE'
    )
  })

  it('rejects a move that makes the subtree deeper than three levels', () => {
    const state = createMockCatalogState()
    expect(
      catchError(() => moveCategory(state, 'cat-city', { parentId: 'cat-sports' })).status
    ).toBe(422)
  })

  it('renames and deactivates; a deactivated category leaves the public tree', () => {
    const state = createMockCatalogState()
    updateCategory(state, 'cat-hiking', { name: 'Trail', isActive: false })
    const publicTree = handleCatalogMock({ method: 'GET', path: '/categories' }, null, state)
    const backpacks = (
      publicTree?.body as { data: { slug: string; children: { name: string }[] }[] }
    ).data[0]
    expect(backpacks.children.map((c) => c.name)).not.toContain('Trail')
  })

  it('deletes only categories without children or products', () => {
    const state = createMockCatalogState()
    expect(catchError(() => deleteCategory(state, 'cat-backpacks')).code).toBe('CATEGORY_NOT_EMPTY')
    expect(catchError(() => deleteCategory(state, 'cat-hiking')).code).toBe('CATEGORY_NOT_EMPTY')
    const empty = createCategory(state, { name: 'Empty' })
    deleteCategory(state, empty.id)
    expect(state.categories.find((n) => n.id === empty.id)).toBeUndefined()
  })
})

describe('admin category endpoints', () => {
  const call = (roles: string[] | null, method: string, path: string, body?: unknown) =>
    handleCatalogMock({ method, path, body }, roles, createMockCatalogState())

  it('requires a signed-in PRODUCT_STAFF user', () => {
    expect(call(null, 'GET', '/admin/categories')?.status).toBe(401)
    expect(call(['MARKETING'], 'GET', '/admin/categories')?.status).toBe(403)
    expect(call(['PRODUCT_STAFF'], 'GET', '/admin/categories')?.status).toBe(200)
  })

  it('answers validation problems with field errors', () => {
    const response = call(['PRODUCT_STAFF'], 'POST', '/admin/categories', { name: '' })
    expect(response?.status).toBe(422)
    expect((response?.body as { errors: Record<string, string[]> }).errors.name).toBeDefined()
  })
})
