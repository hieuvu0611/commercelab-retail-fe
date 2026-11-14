import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockCatalogState, nestCategories } from '@/catalog/mock-catalog'
import { ApiError } from '@/services/api/api-error'

const api = {
  listAdminCategories: jest.fn(),
  createCategory: jest.fn(),
  renameCategory: jest.fn(),
  setCategoryActive: jest.fn(),
  moveCategory: jest.fn(),
  deleteCategory: jest.fn(),
}
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/catalog/admin-api', () => ({
  listAdminCategories: (...args: unknown[]) => api.listAdminCategories(...args),
  createCategory: (...args: unknown[]) => api.createCategory(...args),
  renameCategory: (...args: unknown[]) => api.renameCategory(...args),
  setCategoryActive: (...args: unknown[]) => api.setCategoryActive(...args),
  moveCategory: (...args: unknown[]) => api.moveCategory(...args),
  deleteCategory: (...args: unknown[]) => api.deleteCategory(...args),
}))

import { CategoriesAdmin } from '../categories-admin'

const STAFF = {
  user: { id: 's1', name: 'P', email: 'p@x.vn', roles: ['PRODUCT_STAFF'], warehouseScopes: [] },
}
const tree = nestCategories(createMockCatalogState().categories, null, true)

function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CategoriesAdmin />
    </QueryClientProvider>
  )
}

const httpError = (status: number, code: string, fieldErrors: Record<string, string[]> = {}) =>
  new ApiError({ kind: 'http', status, code, message: code, fieldErrors })

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset())
  api.listAdminCategories.mockResolvedValue(tree)
  sessionState = { data: STAFF, status: 'authenticated' }
})

describe('CategoriesAdmin', () => {
  it('tells other staff they cannot manage categories and loads nothing', () => {
    sessionState = {
      data: { user: { ...STAFF.user, roles: ['MARKETING'] } },
      status: 'authenticated',
    }
    renderAdmin()
    expect(screen.getByText(/don.t have permission to manage categories/)).toBeInTheDocument()
    expect(api.listAdminCategories).not.toHaveBeenCalled()
  })

  it('shows the tree with paths and offers subcategories only above the third level', async () => {
    renderAdmin()
    expect(await screen.findByText('/backpacks/city')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add subcategory City' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add subcategory Laptop packs' })
    ).not.toBeInTheDocument()
  })

  it('creates a subcategory and shows the server validation error next to the field', async () => {
    const user = userEvent.setup()
    api.createCategory.mockRejectedValueOnce(
      httpError(409, 'CATEGORY_SLUG_CONFLICT', {
        name: ['A category with this name already exists here'],
      })
    )
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Add subcategory Bottles' }))
    await user.type(screen.getByLabelText('Name'), 'Sports')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(
      await screen.findByText('A category with this name already exists here')
    ).toBeInTheDocument()
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Sports', parentId: 'cat-bottles' })

    api.createCategory.mockResolvedValueOnce({ data: {} })
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Kids')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('The category was created.')).toBeInTheDocument()
  })

  it('explains why a non-empty category cannot be deleted', async () => {
    const user = userEvent.setup()
    api.deleteCategory.mockRejectedValueOnce(httpError(409, 'CATEGORY_NOT_EMPTY'))
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Delete Backpacks' }))
    await user.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'still has subcategories or products'
    )
  })

  it('does not offer a category or its subcategories as its own new parent', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Move City' }))
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toContain('Backpacks')
    expect(options.some((label) => label?.includes('City'))).toBe(false)
    expect(options.some((label) => label?.includes('Laptop'))).toBe(false)
  })

  it('focuses the name field when a panel opens and closes it on Escape', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Rename City' }))
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })
})
