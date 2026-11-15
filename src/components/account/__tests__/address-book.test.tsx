import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import type { Address } from '@/types/checkout'
import { AddressBook } from '../address-book'

const mockList = jest.fn<Promise<Address[]>, []>()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
jest.mock('@/addresses/address-api', () => ({
  ADDRESSES_KEY: ['addresses'],
  listAddresses: () => mockList(),
  createAddress: (...args: unknown[]) => mockCreate(...args),
  updateAddress: (...args: unknown[]) => mockUpdate(...args),
  deleteAddress: (...args: unknown[]) => mockDelete(...args),
}))
let mockIsSignedIn = true
jest.mock('@/cart/cart-context', () => ({ useCart: () => ({ isSignedIn: mockIsSignedIn }) }))

const make = (id: string, recipient: string, isDefault = false): Address => ({
  id,
  recipient,
  phone: '+84901234567',
  line1: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  province: 'Ho Chi Minh City',
  isDefault,
})

const renderBook = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddressBook />
    </QueryClientProvider>
  )

async function fillForm(user: ReturnType<typeof userEvent.setup>, recipient = 'Binh Tran') {
  const recipientField = screen.getByLabelText('Recipient')
  await user.clear(recipientField)
  await user.type(recipientField, recipient)
  await user.clear(screen.getByLabelText('Phone'))
  await user.type(screen.getByLabelText('Phone'), '0901 234 567')
  await user.clear(screen.getByLabelText('Street address'))
  await user.type(screen.getByLabelText('Street address'), '5 Le Loi')
  await user.clear(screen.getByLabelText('Ward'))
  await user.type(screen.getByLabelText('Ward'), 'Ben Thanh')
  await user.clear(screen.getByLabelText('District'))
  await user.type(screen.getByLabelText('District'), 'District 1')
  await user.clear(screen.getByLabelText('Province or city'))
  await user.type(screen.getByLabelText('Province or city'), 'Ho Chi Minh City')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIsSignedIn = true
  mockList.mockResolvedValue([make('a1', 'Lan Nguyen', true), make('a2', 'Binh Tran')])
})

describe('AddressBook', () => {
  it('waits for the session before asking for the addresses', async () => {
    mockIsSignedIn = false
    renderBook()
    expect(await screen.findByText('Loading your addresses…')).toBeInTheDocument()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('lists the addresses and marks the default', async () => {
    renderBook()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Default')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Default')).not.toBeInTheDocument()
    expect(
      within(items[1]).getByRole('button', { name: /Make the address of Binh Tran/ })
    ).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    mockList.mockResolvedValue([])
    renderBook()
    expect(await screen.findByText('You have no saved addresses yet.')).toBeInTheDocument()
  })

  it('adds an address with the phone normalised by the form', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue(make('a3', 'Binh Tran'))
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Add an address' }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'Binh Tran', phone: '0901234567', isDefault: false })
      )
    )
    expect(await screen.findByText('The address was saved.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'New address' })).not.toBeInTheDocument()
  })

  it('shows validation errors and sends nothing', async () => {
    const user = userEvent.setup()
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Add an address' }))
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('Enter the recipient name')).toBeInTheDocument()
    expect(screen.getByText('Enter an international number of 7 to 15 digits')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('shows the field errors the server returns', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'x',
        fieldErrors: { phone: ['Phone is already used by another address'] },
      })
    )
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Add an address' }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('Phone is already used by another address')).toBeInTheDocument()
  })

  it('edits an address, prefilled, and cancels with Cancel', async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue(make('a2', 'Binh Tran'))
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Edit address of Binh Tran' }))
    expect(screen.getByLabelText('Recipient')).toHaveValue('Binh Tran')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Recipient')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit address of Binh Tran' }))
    await user.clear(screen.getByLabelText('Street address'))
    await user.type(screen.getByLabelText('Street address'), '99 Hai Ba Trung')
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'a2',
        expect.objectContaining({ line1: '99 Hai Ba Trung' })
      )
    )
    expect(await screen.findByText('The address was updated.')).toBeInTheDocument()
  })

  it('makes another address the default', async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue(make('a2', 'Binh Tran', true))
    renderBook()
    await user.click(await screen.findByRole('button', { name: /Make the address of Binh Tran/ }))
    expect(mockUpdate).toHaveBeenCalledWith('a2', expect.objectContaining({ isDefault: true }))
    expect(await screen.findByText(/Binh Tran's address is now your default/)).toBeInTheDocument()
  })

  it('asks before deleting, and Escape or Cancel keeps the address', async () => {
    const user = userEvent.setup()
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Delete address of Binh Tran' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete this address?' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes after confirmation and warns that the default moves on', async () => {
    const user = userEvent.setup()
    mockDelete.mockResolvedValue(undefined)
    renderBook()
    await user.click(await screen.findByRole('button', { name: 'Delete address of Lan Nguyen' }))
    expect(screen.getByText(/newest remaining address becomes the default/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete address' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a1'))
    expect(await screen.findByText('The address was deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('says so and hides Add at the limit of ten', async () => {
    mockList.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => make(`a${i}`, `Person ${i}`, i === 0))
    )
    renderBook()
    expect(await screen.findByText(/saved 10 addresses/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add an address' })).not.toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    mockList.mockRejectedValue(new Error('down'))
    renderBook()
    expect(await screen.findByText(/could not load your addresses/)).toBeInTheDocument()
  })
})
