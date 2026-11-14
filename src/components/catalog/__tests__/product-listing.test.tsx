import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replaceMock = jest.fn()
const fetchMock = jest.fn()
let currentSearch = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/c/backpacks',
  useSearchParams: () => new URLSearchParams(currentSearch),
}))
jest.mock('@/catalog/catalog-api', () => ({
  fetchProductPage: (...args: unknown[]) => fetchMock(...args),
}))

import { ProductListing } from '../product-listing'

const ITEM = {
  id: 'p1',
  slug: 'city-backpack',
  name: 'City Backpack',
  brand: 'Urbanline',
  imageUrl: null,
  minPriceVnd: 300000,
  maxPriceVnd: 340000,
  attributes: { color: ['Black', 'Navy'] },
}

function renderListing(props: { category?: string; q?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProductListing {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  replaceMock.mockReset()
  fetchMock.mockReset()
  currentSearch = ''
})

describe('ProductListing', () => {
  it('shows product cards with a VAT-inclusive price range and colour facets', async () => {
    fetchMock.mockResolvedValue({ items: [ITEM], total: 1, pageCount: 1 })
    renderListing({ category: 'backpacks' })

    expect(await screen.findByRole('link', { name: /City Backpack/ })).toHaveAttribute(
      'href',
      '/p/city-backpack'
    )
    expect(screen.getByText(/330\.000.*374\.000/)).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: 'Navy' })).toBeInTheDocument()
  })

  it('puts a ticked colour in the URL', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ items: [ITEM], total: 1, pageCount: 1 })
    renderListing({ category: 'backpacks' })

    await user.click(await screen.findByRole('checkbox', { name: 'Black' }))
    expect(replaceMock).toHaveBeenCalledWith('/c/backpacks?attr.color=Black', { scroll: false })
  })

  it('reads filters from the URL and sends them to the API', async () => {
    currentSearch = 'attr.color=Navy&sort=price_asc&page=2'
    fetchMock.mockResolvedValue({ items: [ITEM], total: 13, pageCount: 2 })
    renderListing({ category: 'backpacks' })

    await screen.findByRole('link', { name: /City Backpack/ })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'backpacks',
        attrs: { color: ['Navy'] },
        sort: 'price_asc',
        page: 2,
      })
    )
    expect(screen.getByRole('checkbox', { name: 'Navy' })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/c/backpacks?attr.color=Navy&sort=price_asc'
    )
  })

  it('shows a message when a search finds nothing', async () => {
    fetchMock.mockResolvedValue({ items: [], total: 0, pageCount: 1 })
    renderListing({ q: 'zzz' })
    expect(await screen.findByText('No products found for “zzz”')).toBeInTheDocument()
  })

  it('shows an error with a retry button when the API fails', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    renderListing({ category: 'backpacks' })
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the products.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
