import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import type { Address, Quote } from '@/types/checkout'
import { CheckoutView } from '../checkout-view'

const mockListAddresses = jest.fn<Promise<Address[]>, []>()
const mockCreateAddress = jest.fn()
jest.mock('@/addresses/address-api', () => ({
  ADDRESSES_KEY: ['addresses'],
  listAddresses: () => mockListAddresses(),
  createAddress: (...args: unknown[]) => mockCreateAddress(...args),
}))
const mockCreateQuote = jest.fn<Promise<Quote>, [{ addressId: string; voucherCode?: string }]>()
const mockCheckVoucher = jest.fn()
jest.mock('@/checkout/checkout-api', () => ({
  createQuote: (input: { addressId: string; voucherCode?: string }) => mockCreateQuote(input),
  checkVoucher: (code: string) => mockCheckVoucher(code),
}))
let mockCart = { lines: [{ skuId: 'A', quantity: 2 }] as unknown[], subtotalVnd: 0, itemCount: 2 }
let mockIsLoading = false
let mockIsSignedIn = true
jest.mock('@/cart/cart-context', () => ({
  useCart: () => ({ cart: mockCart, isLoading: mockIsLoading, isSignedIn: mockIsSignedIn }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const ADDRESS: Address = {
  id: 'addr-1',
  recipient: 'Lan Nguyen',
  phone: '+84901234567',
  line1: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  province: 'Ho Chi Minh City',
  isDefault: true,
}

const NOW = Date.parse('2026-11-15T10:00:00.000Z')
let counter = 0
const makeQuote = (overrides: Partial<Quote> = {}): Quote => {
  counter += 1
  return {
    quoteId: `q${counter}`,
    version: 'v1',
    addressId: 'addr-1',
    voucherCode: null,
    discountPct: 0,
    subtotalVnd: 700000,
    discountVnd: 0,
    shippingFeeVnd: 30000,
    totalPayableVnd: 730000,
    lines: [
      {
        skuId: 'A',
        skuName: 'City Backpack',
        quantity: 2,
        unitPriceVnd: 300000,
        lineSubtotalVnd: 600000,
        lineDiscountVnd: 0,
        lineNetPayableVnd: 600000,
        allocatedUnitPaidVnd: 300000,
      },
    ],
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    ...overrides,
  }
}
const sc01 = (): Quote =>
  makeQuote({
    version: 'v-sc01',
    voucherCode: 'WELCOME10',
    discountPct: 10,
    discountVnd: 70000,
    totalPayableVnd: 660000,
  })

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CheckoutView />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  counter = 0
  mockCart = { lines: [{ skuId: 'A', quantity: 2 }], subtotalVnd: 0, itemCount: 2 }
  mockIsLoading = false
  mockIsSignedIn = true
  mockListAddresses.mockResolvedValue([ADDRESS])
  mockCreateQuote.mockImplementation(async () => makeQuote())
})
afterEach(() => jest.useRealTimers())

describe('CheckoutView', () => {
  it('sends no request until the session is known', async () => {
    mockIsSignedIn = false
    renderView()
    expect(await screen.findByText('Loading checkout…')).toBeInTheDocument()
    expect(mockListAddresses).not.toHaveBeenCalled()
    expect(mockCreateQuote).not.toHaveBeenCalled()
  })

  it('prices the cart for the default address and shows the breakdown with a countdown', async () => {
    renderView()
    expect(await screen.findByRole('timer')).toHaveTextContent(/Valid for (5:00|4:59)/)
    expect(mockCreateQuote).toHaveBeenCalledWith({ addressId: 'addr-1', voucherCode: undefined })
    expect(screen.getByRole('radio', { name: /Lan Nguyen/ })).toBeChecked()
    expect(screen.getByText('Shipping').nextSibling).toHaveTextContent('30.000')
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('730.000')
  })

  it('applies a voucher, re-prices with it and shows the SC01 total of 660.000', async () => {
    const user = userEvent.setup()
    mockCheckVoucher.mockResolvedValue({
      code: 'WELCOME10',
      eligible: true,
      reason: '',
      discountPct: 10,
    })
    renderView()
    await screen.findByRole('timer')
    mockCreateQuote.mockImplementation(async () => sc01())
    await user.type(screen.getByLabelText('Voucher code'), 'welcome10')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Voucher WELCOME10')).toBeInTheDocument()
    expect(mockCreateQuote).toHaveBeenLastCalledWith({
      addressId: 'addr-1',
      voucherCode: 'WELCOME10',
    })
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('660.000')
    expect(screen.getByText(/Nothing is reserved until you order/)).toBeInTheDocument()
  })

  it('explains a refused voucher in words and keeps the current quote', async () => {
    const user = userEvent.setup()
    mockCheckVoucher.mockResolvedValue({
      code: 'X',
      eligible: false,
      reason: 'VOUCHER_EXPIRED',
      discountPct: 0,
    })
    renderView()
    await screen.findByRole('timer')
    await user.type(screen.getByLabelText('Voucher code'), 'x')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('This voucher has expired.')).toBeInTheDocument()
    expect(mockCreateQuote).toHaveBeenCalledTimes(1)
  })

  it('removes the voucher and prices again without it', async () => {
    const user = userEvent.setup()
    mockCheckVoucher.mockResolvedValue({
      code: 'WELCOME10',
      eligible: true,
      reason: '',
      discountPct: 10,
    })
    renderView()
    await screen.findByRole('timer')
    await user.type(screen.getByLabelText('Voucher code'), 'welcome10')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(await screen.findByRole('button', { name: 'Remove voucher' }))
    await waitFor(() =>
      expect(mockCreateQuote).toHaveBeenLastCalledWith({
        addressId: 'addr-1',
        voucherCode: undefined,
      })
    )
  })

  it('needs an explicit acceptance and says nothing was charged', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Accept quote' }))
    expect(screen.getByRole('status')).toHaveTextContent('You accepted this quote')
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument()
  })

  it('asks for a new acceptance when the address changes the quote', async () => {
    const user = userEvent.setup()
    mockListAddresses.mockResolvedValue([
      ADDRESS,
      { ...ADDRESS, id: 'addr-2', recipient: 'Binh Tran', isDefault: false },
    ])
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Accept quote' }))
    mockCreateQuote.mockImplementation(async () =>
      makeQuote({ version: 'v2', totalPayableVnd: 750000 })
    )
    await user.click(screen.getByRole('radio', { name: /Binh Tran/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /730\.000.*750\.000.*accept it again/
    )
    expect(screen.getByRole('button', { name: 'Accept quote' })).toBeEnabled()
  })

  it('locks acceptance at expiry and re-accepts only after a new quote', async () => {
    jest.useFakeTimers({ now: NOW })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Accept quote' }))
    expect(screen.getByRole('status')).toHaveTextContent('You accepted')

    act(() => {
      jest.advanceTimersByTime(300000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('Expired')
    expect(screen.getByText(/This quote has expired/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument()
    expect(screen.queryByText(/You accepted/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Get a new quote' }))
    expect(await screen.findByText(/Your quote expired and was refreshed/)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('Valid for 5:00')
    expect(screen.getByRole('button', { name: 'Accept quote' })).toBeEnabled()
  })

  it('sends the customer to the cart when an item can no longer be ordered', async () => {
    mockCreateQuote.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'SKU_NOT_ORDERABLE', message: 'x' })
    )
    renderView()
    expect(await screen.findByText(/can no longer be ordered/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to cart' })).toHaveAttribute('href', '/cart')
  })

  it('offers a retry on a failure it cannot explain', async () => {
    const user = userEvent.setup()
    mockCreateQuote.mockRejectedValueOnce(new Error('network'))
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('timer')).toBeInTheDocument()
  })

  it('shows the add-address form when there is no address, and uses the saved one', async () => {
    const user = userEvent.setup()
    mockListAddresses.mockResolvedValueOnce([])
    mockCreateAddress.mockResolvedValue(ADDRESS)
    renderView()
    expect(await screen.findByText('Add a delivery address')).toBeInTheDocument()
    expect(mockCreateQuote).not.toHaveBeenCalled()
    mockListAddresses.mockResolvedValue([ADDRESS])
    await user.type(screen.getByLabelText('Recipient'), 'Lan Nguyen')
    await user.type(screen.getByLabelText('Phone'), '+84901234567')
    await user.type(screen.getByLabelText('Street address'), '12 Nguyen Hue')
    await user.type(screen.getByLabelText('Ward'), 'Ben Nghe')
    await user.type(screen.getByLabelText('District'), 'District 1')
    await user.type(screen.getByLabelText('Province or city'), 'Ho Chi Minh City')
    await user.click(screen.getByRole('button', { name: 'Save and use this address' }))
    expect(await screen.findByRole('timer')).toBeInTheDocument()
    expect(mockCreateAddress).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'Lan Nguyen', phone: '+84901234567', isDefault: false })
    )
  })

  it('shows field errors of the address form without calling the server', async () => {
    const user = userEvent.setup()
    mockListAddresses.mockResolvedValue([])
    renderView()
    await user.click(await screen.findByRole('button', { name: 'Save and use this address' }))
    expect(await screen.findByText('Enter the recipient name')).toBeInTheDocument()
    expect(mockCreateAddress).not.toHaveBeenCalled()
  })

  it('shows an empty-cart message instead of a quote', async () => {
    mockCart = { lines: [], subtotalVnd: 0, itemCount: 0 }
    renderView()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
    expect(mockCreateQuote).not.toHaveBeenCalled()
  })
})
