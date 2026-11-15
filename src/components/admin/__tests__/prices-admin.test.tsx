import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'

const api = { listSkuPrices: jest.fn(), setSkuPrice: jest.fn(), getPriceHistory: jest.fn() }
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/catalog/admin-prices-api', () => ({
  listSkuPrices: (...a: unknown[]) => api.listSkuPrices(...a),
  setSkuPrice: (...a: unknown[]) => api.setSkuPrice(...a),
  getPriceHistory: (...a: unknown[]) => api.getPriceHistory(...a),
}))

import { parseVnd, PricesAdmin } from '../prices-admin'

const MARKETING = {
  user: { id: 'm', name: 'M', email: 'm@x.vn', roles: ['MARKETING'], warehouseScopes: [] },
}
const ROW = {
  skuId: 'BP-1',
  productId: 'p',
  productName: 'City Backpack',
  attributes: { color: 'Black' },
  unitPriceVnd: 300000,
  effectiveFrom: '2026-10-01',
}

function renderPrices() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PricesAdmin />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.listSkuPrices.mockResolvedValue({ items: [ROW], total: 1, pageCount: 1 })
  sessionState = { data: MARKETING, status: 'authenticated' }
})

describe('PricesAdmin', () => {
  it('blocks staff without the MARKETING role', () => {
    sessionState = {
      data: { user: { ...MARKETING.user, roles: ['PRODUCT_STAFF'] } },
      status: 'authenticated',
    }
    renderPrices()
    expect(screen.getByText(/don.t have permission to manage prices/)).toBeInTheDocument()
    expect(api.listSkuPrices).not.toHaveBeenCalled()
  })

  it('contains the visually hidden table header inside its scroll box so a narrow page does not scroll sideways', async () => {
    renderPrices()
    const table = await screen.findByRole('table')
    // sr-only is position: absolute; without a positioned scroll box it escapes the overflow clip.
    expect(table.parentElement).toHaveClass('relative', 'overflow-x-auto')
  })

  it('sets a new price with an effective date', async () => {
    const user = userEvent.setup()
    api.setSkuPrice.mockResolvedValue({})
    renderPrices()
    await user.click(await screen.findByRole('button', { name: 'Set price for BP-1' }))
    await user.type(screen.getByLabelText('New price (VND, incl. VAT)'), '310.000')
    await user.click(screen.getByRole('button', { name: 'Save price' }))
    expect(api.setSkuPrice).toHaveBeenCalledWith('BP-1', {
      unitPriceVnd: 310000,
      effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
    expect(await screen.findByText('The price of BP-1 was saved.')).toBeInTheDocument()
  })

  it('shows the server rule for a price that is not a whole number', async () => {
    const user = userEvent.setup()
    api.setSkuPrice.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'x',
        fieldErrors: { unitPriceVnd: ['Price must be a whole number of VND greater than zero'] },
      })
    )
    renderPrices()
    await user.click(await screen.findByRole('button', { name: 'Set price for BP-1' }))
    await user.type(screen.getByLabelText('New price (VND, incl. VAT)'), '12.5')
    await user.click(screen.getByRole('button', { name: 'Save price' }))
    expect(await screen.findByText(/whole number of VND/)).toBeInTheDocument()
    expect(api.setSkuPrice).toHaveBeenCalledWith(
      'BP-1',
      expect.objectContaining({ unitPriceVnd: Number.NaN })
    )
  })

  it('opens the history, newest first, and closes it on Escape', async () => {
    const user = userEvent.setup()
    api.getPriceHistory.mockResolvedValue([
      { unitPriceVnd: 300000, effectiveFrom: '2026-10-01', effectiveTo: '2026-11-01' },
      { unitPriceVnd: 320000, effectiveFrom: '2026-11-01', effectiveTo: null },
    ])
    renderPrices()
    await user.click(await screen.findByRole('button', { name: 'History of BP-1' }))
    const rows = await screen.findAllByRole('row')
    expect(rows[1]).toHaveTextContent('320.000')
    expect(rows[1]).toHaveTextContent('Current')
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Price history of BP-1')).not.toBeInTheDocument()
  })
})

describe('parseVnd', () => {
  it('reads whole dong with or without thousands separators', () => {
    expect(parseVnd('310000')).toBe(310000)
    expect(parseVnd('310.000')).toBe(310000)
    expect(parseVnd('1,250,000')).toBe(1250000)
    expect(parseVnd(' 310 000 ')).toBe(310000)
  })

  it('does not misread decimals or text as whole dong', () => {
    expect(parseVnd('12.5')).toBeNaN()
    expect(parseVnd('12abc')).toBeNaN()
    expect(parseVnd('')).toBeNaN()
  })
})
