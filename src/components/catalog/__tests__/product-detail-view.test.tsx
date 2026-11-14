import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProductDetail } from '@/types/catalog'
import { ProductDetailView } from '../product-detail-view'

const PRODUCT: ProductDetail = {
  id: 'p1',
  slug: 'city-backpack',
  name: 'City Backpack',
  description: 'A daily pack.',
  brand: 'Urbanline',
  categoryPath: 'backpacks/city',
  variantAxes: ['color', 'capacity'],
  specs: { Material: 'Recycled polyester' },
  images: [{ id: 'i1', url: 'data:image/svg+xml;utf8,x', alt: 'City Backpack' }],
  skus: [
    {
      skuId: 'BLK-20',
      attributes: { color: 'Black', capacity: '20 L' },
      unitPriceVnd: 300000,
      isActive: true,
    },
    {
      skuId: 'BLK-25',
      attributes: { color: 'Black', capacity: '25 L' },
      unitPriceVnd: 320000,
      isActive: true,
    },
    {
      skuId: 'NVY-25',
      attributes: { color: 'Navy', capacity: '25 L' },
      unitPriceVnd: 340000,
      isActive: true,
    },
  ],
  availability: 'unknown',
}

describe('ProductDetailView', () => {
  it('opens on the cheapest variant and shows its price including VAT', () => {
    render(<ProductDetailView product={PRODUCT} />)
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '20 L' })).toBeChecked()
    expect(screen.getByText(/330\.000/)).toBeInTheDocument()
    expect(screen.getByText('SKU BLK-20')).toBeInTheDocument()
  })

  it('disables combinations that do not exist and resolves the SKU when picking another variant', async () => {
    const user = userEvent.setup()
    render(<ProductDetailView product={PRODUCT} />)
    expect(screen.getByRole('radio', { name: 'Navy' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: '25 L' }))
    expect(screen.getByText('SKU BLK-25')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Navy' })).toBeEnabled()

    await user.click(screen.getByRole('radio', { name: 'Navy' }))
    expect(screen.getByText(/374\.000/)).toBeInTheDocument()
  })

  it('keeps the quantity between 1 and 99 and leaves Add to cart for Phase 4', async () => {
    const user = userEvent.setup()
    render(<ProductDetailView product={PRODUCT} />)
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(screen.getByLabelText('Quantity')).toHaveValue('2')
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })
})
