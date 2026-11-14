import { render, screen } from '@testing-library/react'

// Jest globals (not @jest/globals) so SWC hoists jest.mock above the imports.
const mockUsePathname = jest.fn<string, []>()

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

import { AdminSidebar } from '../admin-sidebar'

describe('AdminSidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReset()
  })

  it('marks Overview as the current page only on /admin itself', () => {
    mockUsePathname.mockReturnValue('/admin')

    render(<AdminSidebar />)

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current')
  })

  it('marks a section as current on its nested pages', () => {
    mockUsePathname.mockReturnValue('/admin/catalog/products/sku-123')

    render(<AdminSidebar />)

    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('exposes the sidebar as a labelled navigation landmark', () => {
    mockUsePathname.mockReturnValue('/admin')

    render(<AdminSidebar />)

    expect(screen.getByRole('navigation', { name: 'Backoffice' })).toBeInTheDocument()
  })
})
