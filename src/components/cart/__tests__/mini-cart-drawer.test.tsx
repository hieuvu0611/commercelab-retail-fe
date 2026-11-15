import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GuestCartLine } from '@/types/cart'
import { GUEST_CART_KEY } from '@/cart/guest-cart'
import { useCart } from '@/cart/cart-context'
import { CartWrapper } from '@/test-utils/cart-wrapper'
import { CartButton } from '../cart-button'
import { MiniCartDrawer } from '../mini-cart-drawer'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const LINE: GuestCartLine = {
  skuId: 'A',
  quantity: 2,
  name: 'City Backpack',
  slug: 'city-backpack',
  imageUrl: null,
  attributes: { color: 'Black' },
  unitPriceVnd: 300000,
}

function Page() {
  const { openDrawer } = useCart()
  return (
    <>
      <CartButton />
      <button onClick={openDrawer}>other opener</button>
      <MiniCartDrawer />
    </>
  )
}

const renderPage = () =>
  render(
    <CartWrapper>
      <Page />
    </CartWrapper>
  )

beforeEach(() => window.localStorage.clear())

describe('mini cart drawer', () => {
  it('is closed until the cart button is used and shows the empty state', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cart' }))
    expect(screen.getByRole('dialog', { name: 'Your cart' })).toBeInTheDocument()
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
  })

  it('lists lines with a subtotal, and the cart button shows the unit count', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([LINE]))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Cart, 2 items' }))
    expect(screen.getByRole('link', { name: 'City Backpack' })).toHaveAttribute(
      'href',
      '/p/city-backpack'
    )
    expect(screen.getByText(/Subtotal/).parentElement).toHaveTextContent(/600\.000/)
    expect(screen.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart')
  })

  it('changes quantity and removes a line', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([LINE]))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Cart, 2 items' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity of City Backpack' }))
    expect(screen.getByRole('dialog', { name: 'Your cart (3)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove City Backpack from the cart' }))
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
  })

  it('closes on Escape and gives focus back to the opener', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = screen.getByRole('button', { name: 'Cart' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'Close cart' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('closes on the Close button and keeps Tab inside the panel', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([LINE]))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Cart, 2 items' }))
    const close = screen.getByRole('button', { name: 'Close cart' })
    await user.tab({ shift: true })
    expect(screen.getByRole('link', { name: 'View cart' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
