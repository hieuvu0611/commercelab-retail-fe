import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const listMock = jest.fn()
const createMock = jest.fn()
const pushMock = jest.fn()
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}))
jest.mock('@/catalog/admin-products-api', () => ({
  listAdminProducts: (...a: unknown[]) => listMock(...a),
  createAdminProduct: (...a: unknown[]) => createMock(...a),
}))

import { ProductsAdmin } from '../products-admin'

const STAFF = {
  user: { id: 's', name: 'P', email: 'p@x.vn', roles: ['PRODUCT_STAFF'], warehouseScopes: [] },
}
const row = (id: string, name: string, status = 'DRAFT') => ({
  id,
  slug: id,
  name,
  brand: 'B',
  status,
  version: 1,
  skuCount: 2,
  updatedAt: '2026-11-01T00:00:00Z',
})

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProductsAdmin />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  listMock.mockReset()
  createMock.mockReset()
  pushMock.mockReset()
  sessionState = { data: STAFF, status: 'authenticated' }
  listMock.mockResolvedValue({
    items: [row('p1', 'City Backpack', 'PUBLISHED')],
    total: 12,
    pageCount: 2,
  })
})

describe('ProductsAdmin', () => {
  it('contains the visually hidden table header inside its scroll box so a narrow page does not scroll sideways', async () => {
    renderList()
    const table = await screen.findByRole('table')
    // sr-only is position: absolute; without a positioned scroll box it escapes the overflow clip.
    expect(table.parentElement).toHaveClass('relative', 'overflow-x-auto')
  })

  it('lists products and searches, filters and pages through the API', async () => {
    const user = userEvent.setup()
    renderList()
    expect(await screen.findByRole('link', { name: 'City Backpack' })).toHaveAttribute(
      'href',
      '/admin/catalog/products/p1'
    )

    await user.type(screen.getByLabelText('Search products'), 'bag{Enter}')
    await screen.findByRole('link', { name: 'City Backpack' })
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'bag', page: 1 }))

    await user.selectOptions(screen.getByLabelText('Status'), 'DRAFT')
    await screen.findByRole('link', { name: 'City Backpack' })
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'DRAFT' }))

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('creates a draft and opens its editor', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue({ id: 'prod-tote' })
    renderList()
    await user.click(await screen.findByRole('button', { name: 'New product' }))
    await user.type(screen.getByLabelText('Product name'), 'Tote')
    await user.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(createMock).toHaveBeenCalledWith('Tote')
    expect(pushMock).toHaveBeenCalledWith('/admin/catalog/products/prod-tote')
  })

  it('blocks other staff', () => {
    sessionState = {
      data: { user: { ...STAFF.user, roles: ['MARKETING'] } },
      status: 'authenticated',
    }
    renderList()
    expect(screen.getByText(/don.t have permission to manage products/)).toBeInTheDocument()
    expect(listMock).not.toHaveBeenCalled()
  })
})
