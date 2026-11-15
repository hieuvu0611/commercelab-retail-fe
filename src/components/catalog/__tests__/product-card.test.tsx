import { render, screen } from '@testing-library/react'
import type { ProductListItem } from '@/types/catalog'
import { ProductCard } from '../product-card'

const PRODUCT: ProductListItem = {
  id: 'p1',
  slug: 'city-backpack',
  name: 'City Backpack',
  brand: 'Urbanline',
  imageUrl: null,
  minPriceVnd: 300000,
  maxPriceVnd: 340000,
  attributes: { color: ['Black'] },
}

const renderCard = (product: ProductListItem) =>
  render(
    <ul>
      <ProductCard product={product} />
    </ul>
  )

describe('ProductCard availability', () => {
  it.each([
    ['IN_STOCK', 'In stock'],
    ['LOW', 'Low stock'],
    ['OUT', 'Out of stock'],
  ] as const)('shows %s as "%s"', (availability, label) => {
    renderCard({ ...PRODUCT, availability })
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('says nothing when availability is unknown or missing', () => {
    const { unmount } = renderCard({ ...PRODUCT, availability: 'unknown' })
    expect(screen.queryByText(/stock/i)).not.toBeInTheDocument()
    unmount()
    renderCard(PRODUCT)
    expect(screen.queryByText(/stock/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /City Backpack/ })).toHaveAttribute(
      'href',
      '/p/city-backpack'
    )
  })

  it('keeps an out-of-stock product visible and linked', () => {
    renderCard({ ...PRODUCT, availability: 'OUT' })
    expect(screen.getByRole('link', { name: /City Backpack/ })).toBeInTheDocument()
  })
})
