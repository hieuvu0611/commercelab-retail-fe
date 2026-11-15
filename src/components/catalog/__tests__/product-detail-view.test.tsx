import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProductDetail } from '@/types/catalog'
import type { Availability } from '@/types/inventory'
import { readGuestCart } from '@/cart/guest-cart'
import { CartWrapper } from '@/test-utils/cart-wrapper'
import { ProductDetailView } from '../product-detail-view'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

beforeEach(() => window.localStorage.clear())

const renderView = (product: ProductDetail) =>
  render(
    <CartWrapper>
      <ProductDetailView product={product} />
    </CartWrapper>
  )

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
    renderView(PRODUCT)
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '20 L' })).toBeChecked()
    expect(screen.getByText(/330\.000/)).toBeInTheDocument()
    expect(screen.getByText('SKU BLK-20')).toBeInTheDocument()
  })

  it('disables combinations that do not exist and resolves the SKU when picking another variant', async () => {
    const user = userEvent.setup()
    renderView(PRODUCT)
    expect(screen.getByRole('radio', { name: 'Navy' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: '25 L' }))
    expect(screen.getByText('SKU BLK-25')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Navy' })).toBeEnabled()

    await user.click(screen.getByRole('radio', { name: 'Navy' }))
    expect(screen.getByText(/374\.000/)).toBeInTheDocument()
  })

  it('keeps the quantity between 1 and 99', async () => {
    const user = userEvent.setup()
    renderView(PRODUCT)
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(screen.getByLabelText('Quantity')).toHaveValue('2')
  })
})

describe('ProductDetailView availability', () => {
  const withStock = (stock: Record<string, Availability | undefined>): ProductDetail => ({
    ...PRODUCT,
    skus: PRODUCT.skus.map((sku) => ({ ...sku, availability: stock[sku.skuId] })),
  })

  it('shows the state of the selected SKU and follows the selection, never a count', async () => {
    const user = userEvent.setup()
    renderView(withStock({ 'BLK-20': 'IN_STOCK', 'BLK-25': 'LOW', 'NVY-25': 'OUT' }))
    expect(screen.getByText('In stock')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '25 L' }))
    expect(screen.getByText('Low stock')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Navy' }))
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByText(/\d+ (left|in stock|available)/i)).not.toBeInTheDocument()
  })

  it('disables Add to cart only while the selected SKU is out of stock', async () => {
    const user = userEvent.setup()
    renderView(withStock({ 'BLK-20': 'IN_STOCK', 'BLK-25': 'OUT' }))
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
    await user.click(screen.getByRole('radio', { name: '25 L' }))
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    expect(screen.getByText('This variant is out of stock.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '20 L' }))
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
  })

  it('keeps Add to cart enabled and the page intact when availability is unknown or missing', () => {
    const { rerender } = renderView(withStock({ 'BLK-20': 'unknown' }))
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
    expect(screen.getByText('Availability is confirmed at checkout.')).toBeInTheDocument()
    rerender(
      <CartWrapper>
        <ProductDetailView product={withStock({})} />
      </CartWrapper>
    )
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
    expect(screen.queryByText(/stock/i)).not.toBeInTheDocument()
  })

  it('adds the selected variant and quantity to the guest cart and says so', async () => {
    const user = userEvent.setup()
    renderView(withStock({ 'BLK-20': 'IN_STOCK' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByRole('status')).toHaveTextContent('Added 2 × City Backpack to your cart.')
    expect(readGuestCart()).toMatchObject([
      { skuId: 'BLK-20', quantity: 2, unitPriceVnd: 300000, attributes: { color: 'Black' } },
    ])
  })

  it('raises the quantity when the same variant is added again', async () => {
    const user = userEvent.setup()
    renderView(withStock({ 'BLK-20': 'IN_STOCK' }))
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(readGuestCart()).toMatchObject([{ skuId: 'BLK-20', quantity: 2 }])
  })
})
