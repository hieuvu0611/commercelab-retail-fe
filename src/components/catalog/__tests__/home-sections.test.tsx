import { render, screen, within } from '@testing-library/react'
import { createMockCatalogState, nestCategories } from '@/catalog/mock-catalog'
import type { ProductListItem } from '@/types/catalog'
import { FeaturedCategories, Hero, NewProductsRail } from '../home-sections'

const product = (id: string, name: string): ProductListItem => ({
  id,
  slug: id,
  name,
  brand: 'Brand',
  imageUrl: null,
  minPriceVnd: 100000,
  maxPriceVnd: 100000,
  attributes: { color: ['Black'] },
})

describe('home sections', () => {
  it('links the hero to the shop', () => {
    render(<Hero shopHref="/c/backpacks" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Backpacks, bottles')
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/c/backpacks')
  })

  it('lists the top-level categories with their subcategories', () => {
    const tree = nestCategories(createMockCatalogState().categories, null)
    render(<FeaturedCategories categories={tree} />)
    const backpacks = screen.getByRole('link', { name: /Backpacks/ })
    expect(backpacks).toHaveAttribute('href', '/c/backpacks')
    expect(within(backpacks).getByText('City · Travel · Hiking')).toBeInTheDocument()
  })

  it('renders new arrivals and nothing when there are none', () => {
    const { rerender, container } = render(<NewProductsRail products={[product('a', 'Alpha')]} />)
    expect(screen.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/p/a')
    rerender(<NewProductsRail products={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
