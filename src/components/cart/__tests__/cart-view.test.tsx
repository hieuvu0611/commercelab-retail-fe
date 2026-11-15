import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GuestCartLine } from '@/types/cart'
import { GUEST_CART_KEY, readGuestCart } from '@/cart/guest-cart'
import { CartWrapper } from '@/test-utils/cart-wrapper'
import { CartView } from '../cart-view'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

const line = (skuId: string, quantity: number, price: number): GuestCartLine => ({
  skuId,
  quantity,
  name: `Item ${skuId}`,
  slug: `item-${skuId}`,
  imageUrl: null,
  attributes: {},
  unitPriceVnd: price,
})

const renderView = () =>
  render(
    <CartWrapper>
      <CartView />
    </CartWrapper>
  )

beforeEach(() => window.localStorage.clear())

describe('CartView', () => {
  it('invites a guest to keep shopping when the cart is empty', () => {
    renderView()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/')
  })

  it('shows the SC01 lines with a subtotal of 700.000 and the sign-in note', async () => {
    window.localStorage.setItem(
      GUEST_CART_KEY,
      JSON.stringify([line('A', 2, 300000), line('B', 1, 100000)])
    )
    renderView()
    expect(await screen.findByLabelText('Cart summary')).toHaveTextContent(/700\.000/)
    expect(screen.getByLabelText('Cart summary')).toHaveTextContent('3 items')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fcart'
    )
    expect(screen.getByText(/Nothing is reserved/)).toBeInTheDocument()
  })

  it('updates the quantity by typing and removes a line', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([line('A', 2, 300000)]))
    const user = userEvent.setup()
    renderView()
    const input = await screen.findByRole('textbox', { name: 'Quantity of Item A' })
    await user.clear(input)
    await user.type(input, '150{Enter}')
    expect(readGuestCart()[0].quantity).toBe(99)
    expect(screen.getByRole('textbox', { name: 'Quantity of Item A' })).toHaveValue('99')
    expect(screen.getByRole('button', { name: 'Increase quantity of Item A' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove Item A from the cart' }))
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })
})
