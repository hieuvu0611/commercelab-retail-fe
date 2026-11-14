import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockCatalogState, nestCategories } from '@/catalog/mock-catalog'
import { CategoryMenu } from '../category-menu'
import { CatalogBreadcrumb } from '../catalog-breadcrumb'

const tree = nestCategories(createMockCatalogState().categories, null)

describe('CategoryMenu', () => {
  it('opens a top-level category, lists its levels and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<CategoryMenu tree={tree} />)
    const trigger = screen.getByRole('button', { name: 'Backpacks' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'City' })).toHaveAttribute('href', '/c/backpacks/city')
    expect(screen.getByRole('link', { name: 'Laptop packs' })).toHaveAttribute(
      'href',
      '/c/backpacks/city/laptop'
    )

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('opens the drawer on small screens and lists every level', async () => {
    const user = userEvent.setup()
    render(<CategoryMenu tree={tree} />)
    await user.click(screen.getByRole('button', { name: 'Browse categories' }))
    expect(screen.getByRole('link', { name: 'Locks' })).toHaveAttribute(
      'href',
      '/c/travel-accessories/locks'
    )
  })
})

describe('CatalogBreadcrumb', () => {
  it('marks the last entry as the current page', () => {
    render(<CatalogBreadcrumb entries={[{ label: 'Home', href: '/' }, { label: 'Bottles' }]} />)
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Bottles')).toHaveAttribute('aria-current', 'page')
  })
})
