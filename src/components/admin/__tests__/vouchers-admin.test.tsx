import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import type { VoucherCampaign } from '@/types/voucher'

const api = { listCampaigns: jest.fn(), createCampaign: jest.fn(), updateCampaign: jest.fn() }
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/vouchers/admin-vouchers-api', () => ({
  VOUCHERS_KEY: ['admin-vouchers'],
  listCampaigns: (...a: unknown[]) => api.listCampaigns(...a),
  createCampaign: (...a: unknown[]) => api.createCampaign(...a),
  updateCampaign: (...a: unknown[]) => api.updateCampaign(...a),
}))

import { formatWindow, VouchersAdmin } from '../vouchers-admin'

const MARKETING = {
  user: { id: 'm', name: 'M', email: 'm@x.vn', roles: ['MARKETING'], warehouseScopes: [] },
}
const make = (overrides: Partial<VoucherCampaign> = {}): VoucherCampaign => ({
  code: 'WELCOME10',
  name: 'Welcome 10% off',
  discountPct: 10,
  totalQuota: 100,
  availableQuota: 95,
  reservedQuota: 2,
  consumedQuota: 3,
  perCustomerLimit: 1,
  startsAt: null,
  endsAt: null,
  status: 'ACTIVE',
  ...overrides,
})
const page = (items: VoucherCampaign[], pageCount = 1) => ({
  items,
  total: items.length,
  pageCount,
})

const renderAdmin = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VouchersAdmin />
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.listCampaigns.mockResolvedValue(
    page([make(), make({ code: 'OLD5', name: 'Old', status: 'PAUSED' })])
  )
  sessionState = { data: MARKETING, status: 'authenticated' }
})

async function fillNew(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Code'), 'spring15')
  await user.type(screen.getByLabelText('Name'), 'Spring')
  await user.clear(screen.getByLabelText('Discount (%)'))
  await user.type(screen.getByLabelText('Discount (%)'), '15')
}

describe('VouchersAdmin', () => {
  it('blocks staff without the MARKETING role and sends no request', () => {
    sessionState = {
      data: { user: { ...MARKETING.user, roles: ['PRODUCT_STAFF'] } },
      status: 'authenticated',
    }
    renderAdmin()
    expect(
      screen.getByText(/don.t have permission to manage voucher campaigns/)
    ).toBeInTheDocument()
    expect(api.listCampaigns).not.toHaveBeenCalled()
  })

  it('lists campaigns with their quota buckets and status', async () => {
    renderAdmin()
    const rows = await screen.findAllByRole('row')
    const first = within(rows[1])
    expect(first.getByText('WELCOME10')).toBeInTheDocument()
    expect(first.getByText('10%')).toBeInTheDocument()
    expect(first.getByText('95 of 100')).toBeInTheDocument()
    expect(first.getByText('Always open')).toBeInTheDocument()
    expect(first.getByText('Active')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Inactive')).toBeInTheDocument()
    expect(within(rows[2]).getByRole('button', { name: 'Activate OLD5' })).toBeInTheDocument()
  })

  it('searches and filters by status', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findAllByRole('row')
    await user.type(screen.getByLabelText('Search vouchers'), 'welcome')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(api.listCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'welcome', page: 1 })
      )
    )
    await user.selectOptions(screen.getByLabelText('Status'), 'PAUSED')
    await waitFor(() =>
      expect(api.listCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'PAUSED' })
      )
    )
  })

  it('creates a campaign with the code upper-cased and an open window', async () => {
    const user = userEvent.setup()
    api.createCampaign.mockResolvedValue(make({ code: 'SPRING15' }))
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'New voucher' }))
    await fillNew(user)
    await user.click(screen.getByRole('button', { name: 'Create voucher' }))
    await waitFor(() =>
      expect(api.createCampaign).toHaveBeenCalledWith({
        code: 'SPRING15',
        name: 'Spring',
        discountPct: 15,
        totalQuota: 100,
        perCustomerLimit: 1,
        startsAt: null,
        endsAt: null,
        status: 'ACTIVE',
      })
    )
    expect(await screen.findByText('Voucher SPRING15 was created.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'New voucher campaign' })).not.toBeInTheDocument()
  })

  it('shows validation errors without calling the server', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'New voucher' }))
    await user.clear(screen.getByLabelText('Discount (%)'))
    await user.type(screen.getByLabelText('Discount (%)'), '150')
    await user.click(screen.getByRole('button', { name: 'Create voucher' }))
    expect(
      await screen.findByText('Use 3 to 32 letters, digits, hyphens or underscores')
    ).toBeInTheDocument()
    expect(screen.getByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByText('Discount must be at most 100')).toBeInTheDocument()
    expect(api.createCampaign).not.toHaveBeenCalled()
  })

  it('rejects an end date that is not after the start', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'New voucher' }))
    await fillNew(user)
    await user.type(screen.getByLabelText('Starts (optional)'), '2026-12-31T10:00')
    await user.type(screen.getByLabelText('Ends (optional)'), '2026-12-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create voucher' }))
    expect(await screen.findByText('The end must be after the start')).toBeInTheDocument()
    expect(api.createCampaign).not.toHaveBeenCalled()
  })

  it('shows a duplicate code on the code field', async () => {
    const user = userEvent.setup()
    api.createCampaign.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'VOUCHER_CODE_EXISTS', message: 'x' })
    )
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'New voucher' }))
    await fillNew(user)
    await user.click(screen.getByRole('button', { name: 'Create voucher' }))
    expect(await screen.findByText('A voucher with this code already exists')).toBeInTheDocument()
  })

  it('edits a campaign: the code is fixed and a used voucher keeps its discount', async () => {
    const user = userEvent.setup()
    api.updateCampaign.mockResolvedValue(make())
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Edit WELCOME10' }))
    expect(screen.getByLabelText('Code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Discount (%)')).toHaveAttribute('readonly')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Welcome back')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.updateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'WELCOME10',
          name: 'Welcome back',
          discountPct: 10,
          status: 'ACTIVE',
        })
      )
    )
    expect(await screen.findByText('Voucher WELCOME10 was updated.')).toBeInTheDocument()
  })

  it('shows the server field errors, such as a quota below what is in use', async () => {
    const user = userEvent.setup()
    api.updateCampaign.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'x',
        fieldErrors: { totalQuota: ['Quota cannot be below the 5 already reserved or used'] },
      })
    )
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Edit WELCOME10' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Quota cannot be below the 5/)).toBeInTheDocument()
  })

  it('closes the edit panel with Escape', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Edit WELCOME10' }))
    expect(screen.getByRole('region', { name: 'Edit WELCOME10' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Edit WELCOME10' })).not.toBeInTheDocument()
  })

  it('asks before deactivating, keeps the voucher on Escape and deactivates on confirm', async () => {
    const user = userEvent.setup()
    api.updateCampaign.mockResolvedValue(make({ status: 'PAUSED' }))
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Deactivate WELCOME10' }))
    expect(screen.getByRole('alertdialog', { name: 'Deactivate WELCOME10?' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(api.updateCampaign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Deactivate WELCOME10' }))
    await user.click(screen.getByRole('button', { name: 'Deactivate voucher' }))
    await waitFor(() =>
      expect(api.updateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'WELCOME10', status: 'PAUSED' })
      )
    )
    expect(await screen.findByText('Voucher WELCOME10 was deactivated.')).toBeInTheDocument()
  })

  it('activates an inactive voucher at once', async () => {
    const user = userEvent.setup()
    api.updateCampaign.mockResolvedValue(make({ code: 'OLD5' }))
    renderAdmin()
    await user.click(await screen.findByRole('button', { name: 'Activate OLD5' }))
    await waitFor(() =>
      expect(api.updateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'OLD5', status: 'ACTIVE' })
      )
    )
    expect(await screen.findByText('Voucher OLD5 is active again.')).toBeInTheDocument()
  })

  it('reports a failed load and an empty result', async () => {
    api.listCampaigns.mockRejectedValue(new Error('down'))
    const { unmount } = renderAdmin()
    expect(await screen.findByText(/could not load the vouchers/)).toBeInTheDocument()
    unmount()
    api.listCampaigns.mockResolvedValue(page([]))
    renderAdmin()
    expect(await screen.findByText('No vouchers match.')).toBeInTheDocument()
  })
})

describe('formatWindow', () => {
  it('describes open, half-open and closed windows', () => {
    expect(formatWindow({ startsAt: null, endsAt: null })).toBe('Always open')
    expect(formatWindow({ startsAt: null, endsAt: '2026-12-31T00:00:00.000Z' })).toMatch(
      /^Now to .*2026/
    )
    expect(formatWindow({ startsAt: '2026-12-01T00:00:00.000Z', endsAt: null })).toMatch(
      /2026.* to no end$/
    )
  })
})
