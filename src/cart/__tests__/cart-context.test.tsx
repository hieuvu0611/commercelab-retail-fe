import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Cart, GuestCartLine } from '@/types/cart'
import { CartWrapper } from '@/test-utils/cart-wrapper'
import { GUEST_CART_KEY, readGuestCart } from '../guest-cart'
import { useCart } from '../cart-context'

let sessionState: { data: unknown; status: string } = { data: null, status: 'unauthenticated' }
jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))

const mockGetCart = jest.fn<Promise<Cart>, []>()
const mockPutCartItem = jest.fn()
const mockDeleteCartItem = jest.fn()
const mockMergeGuestCart = jest.fn()
jest.mock('../cart-api', () => ({
  getCart: () => mockGetCart(),
  putCartItem: (...args: unknown[]) => mockPutCartItem(...args),
  deleteCartItem: (...args: unknown[]) => mockDeleteCartItem(...args),
  mergeGuestCart: (...args: unknown[]) => mockMergeGuestCart(...args),
}))

const SIGNED_IN = {
  data: { user: { id: 'u1', roles: ['CUSTOMER'] }, accessToken: 'token' },
  status: 'authenticated',
}
const GUEST_LINE: GuestCartLine = {
  skuId: 'A',
  quantity: 2,
  name: 'City Backpack',
  slug: 'city-backpack',
  imageUrl: null,
  attributes: { color: 'Black' },
  unitPriceVnd: 300000,
}
const serverCart = (quantity: number): Cart => ({
  lines: [
    {
      ...GUEST_LINE,
      quantity,
      lineTotalVnd: quantity * 300000,
      isAvailable: true,
    },
  ],
  subtotalVnd: quantity * 300000,
  itemCount: quantity,
})

function Probe() {
  const cart = useCart()
  return (
    <div>
      <p data-testid="count">{cart.cart.itemCount}</p>
      <p data-testid="notice">{cart.notice}</p>
      <p data-testid="error">{cart.error}</p>
      <button onClick={() => void cart.addItem({ ...GUEST_LINE, quantity: 1 })}>add</button>
      <button onClick={() => void cart.setQuantity('A', 7)}>set</button>
      <button onClick={() => void cart.removeItem('A')}>remove</button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <CartWrapper>
      <Probe />
    </CartWrapper>
  )

beforeEach(() => {
  window.localStorage.clear()
  sessionState = { data: null, status: 'unauthenticated' }
  jest.clearAllMocks()
  mockGetCart.mockResolvedValue({ lines: [], subtotalVnd: 0, itemCount: 0 })
})

describe('CartProvider as a guest', () => {
  it('keeps added items in localStorage and calls no API', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('add'))
    await user.click(screen.getByText('add'))
    expect(screen.getByTestId('count')).toHaveTextContent('2')
    expect(readGuestCart()[0].quantity).toBe(2)
    await user.click(screen.getByText('set'))
    expect(screen.getByTestId('count')).toHaveTextContent('7')
    await user.click(screen.getByText('remove'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull()
    expect(mockGetCart).not.toHaveBeenCalled()
    expect(mockPutCartItem).not.toHaveBeenCalled()
  })

  it('restores the cart saved earlier', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([GUEST_LINE]))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
  })
})

describe('CartProvider signed in', () => {
  beforeEach(() => {
    sessionState = SIGNED_IN
  })

  it('merges the guest cart once, then clears the browser copy', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([GUEST_LINE]))
    mockMergeGuestCart.mockResolvedValue({ skipped: [] })
    mockGetCart.mockResolvedValue(serverCart(2))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    expect(mockMergeGuestCart).toHaveBeenCalledTimes(1)
    expect(mockMergeGuestCart).toHaveBeenCalledWith([GUEST_LINE])
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull()
    expect(screen.getByTestId('notice')).toHaveTextContent(/now in your cart/)
  })

  it('reports lines the server left out', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([GUEST_LINE]))
    mockMergeGuestCart.mockResolvedValue({ skipped: [{ skuId: 'A', reason: 'SKU_UNAVAILABLE' }] })
    renderProbe()
    await waitFor(() =>
      expect(screen.getByTestId('notice')).toHaveTextContent(
        '1 item from your earlier cart is no longer'
      )
    )
  })

  it('keeps the guest cart on this device when the merge fails', async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([GUEST_LINE]))
    mockMergeGuestCart.mockRejectedValue(new Error('down'))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('notice')).toHaveTextContent(/still saved/))
    expect(readGuestCart()).toHaveLength(1)
  })

  it('does not merge when there is nothing saved', async () => {
    renderProbe()
    await waitFor(() => expect(mockGetCart).toHaveBeenCalled())
    expect(mockMergeGuestCart).not.toHaveBeenCalled()
  })

  it('adds on top of the quantity already in the account cart', async () => {
    const user = userEvent.setup()
    mockGetCart.mockResolvedValue(serverCart(2))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    await user.click(screen.getByText('add'))
    expect(mockPutCartItem).toHaveBeenCalledWith('A', 3)
    await user.click(screen.getByText('set'))
    expect(mockPutCartItem).toHaveBeenLastCalledWith('A', 7)
    await user.click(screen.getByText('remove'))
    expect(mockDeleteCartItem).toHaveBeenCalledWith('A')
  })

  it('shows an error and leaves the cart alone when the server refuses', async () => {
    const user = userEvent.setup()
    mockPutCartItem.mockRejectedValue(new Error('boom'))
    renderProbe()
    await act(async () => {
      await user.click(screen.getByText('add'))
    })
    expect(screen.getByTestId('error')).toHaveTextContent('We could not update your cart')
  })
})

it('throws when used outside the provider', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  expect(() => render(<Probe />)).toThrow('useCart must be used inside CartProvider')
  spy.mockRestore()
})
