import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'

const api = { listInventory: jest.fn(), getMovements: jest.fn(), postOpeningStock: jest.fn() }
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/inventory/admin-inventory-api', () => ({
  listInventory: (...a: unknown[]) => api.listInventory(...a),
  getMovements: (...a: unknown[]) => api.getMovements(...a),
  postOpeningStock: (...a: unknown[]) => api.postOpeningStock(...a),
}))

import { InventoryAdmin } from '../inventory-admin'

const user = (roles: string[], warehouseScopes: string[]) => ({
  data: { user: { id: 'u', name: 'U', email: 'u@x.vn', roles, warehouseScopes } },
  status: 'authenticated',
})
const ROW = {
  skuId: 'BP-1',
  warehouseId: 'WH-HCM-01',
  onHand: 100,
  unsellable: 5,
  reserved: 10,
  committed: 15,
  available: 70,
}

function renderInventory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InventoryAdmin />
    </QueryClientProvider>
  )
}

const apiError = (status: number, code: string, fieldErrors: Record<string, string[]> = {}) =>
  new ApiError({ kind: 'http', status, code, message: 'x', fieldErrors })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.listInventory.mockResolvedValue({ items: [ROW], total: 1, pageCount: 1 })
  api.getMovements.mockResolvedValue([])
  sessionState = user(['WAREHOUSE_MGR'], ['WH-HCM-01'])
})

describe('InventoryAdmin', () => {
  it('blocks staff without a warehouse role', () => {
    sessionState = user(['MARKETING'], [])
    renderInventory()
    expect(screen.getByText(/don.t have permission to manage inventory/)).toBeInTheDocument()
    expect(api.listInventory).not.toHaveBeenCalled()
  })

  it('shows every bucket of a SKU in the warehouse', async () => {
    renderInventory()
    const row = (await screen.findByRole('row', { name: /BP-1/ })) as HTMLElement
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(cells).toEqual(expect.arrayContaining(['100', '5', '10', '15', '70']))
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
      expect.arrayContaining(['On hand', 'Unsellable', 'Reserved', 'Committed', 'Available'])
    )
    expect(api.listInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouse: undefined,
        warehouses: ['WH-HCM-01'],
        q: '',
        page: 1,
      })
    )
  })

  it('offers only the warehouses in scope and filters by one', async () => {
    const actor = userEvent.setup()
    sessionState = user(['WAREHOUSE_STAFF'], ['ALL'])
    renderInventory()
    const select = await screen.findByLabelText('Warehouse')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['All warehouses', 'WH-HCM-01', 'WH-HN-01'])
    await actor.selectOptions(select, 'WH-HN-01')
    expect(api.listInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouse: 'WH-HN-01' })
    )
  })

  it('fixes the warehouse for a scoped user', async () => {
    renderInventory()
    expect(await screen.findByText(/Showing warehouse WH-HCM-01/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Warehouse')).not.toBeInTheDocument()
  })

  it('lists the movement history of a SKU: type, quantity, who, why, when', async () => {
    const actor = userEvent.setup()
    api.getMovements.mockResolvedValue([
      {
        id: 'm1',
        skuId: 'BP-1',
        warehouseId: 'WH-HCM-01',
        type: 'OPENING',
        qty: 100,
        actor: 'HCM Manager',
        reason: 'Opening count',
        at: '2026-10-01T09:00:00.000Z',
      },
    ])
    renderInventory()
    await actor.click(await screen.findByRole('button', { name: 'History of BP-1 in WH-HCM-01' }))
    const panel = await screen.findByRole('region', { name: 'Movement history of BP-1' })
    expect(await within(panel).findByText('HCM Manager')).toBeInTheDocument()
    expect(within(panel).getByText('Opening count')).toBeInTheDocument()
    expect(within(panel).getByText('Opening stock')).toBeInTheDocument()
    expect(api.getMovements).toHaveBeenCalledWith('BP-1', 'WH-HCM-01')
  })

  it('closes a panel with Escape', async () => {
    const actor = userEvent.setup()
    renderInventory()
    await actor.click(await screen.findByRole('button', { name: 'History of BP-1 in WH-HCM-01' }))
    expect(
      await screen.findByRole('region', { name: 'Movement history of BP-1' })
    ).toBeInTheDocument()
    await actor.keyboard('{Escape}')
    expect(
      screen.queryByRole('region', { name: 'Movement history of BP-1' })
    ).not.toBeInTheDocument()
  })

  it('shows the plain-words reason when the list cannot be loaded', async () => {
    api.listInventory.mockRejectedValue(apiError(500, 'INTERNAL'))
    renderInventory()
    expect(await screen.findByText(/could not load the inventory/)).toBeInTheDocument()
  })
})

describe('opening stock form', () => {
  async function openForm() {
    const actor = userEvent.setup()
    renderInventory()
    await actor.click(await screen.findByRole('button', { name: 'Add opening stock' }))
    return actor
  }

  it('is offered to warehouse managers only', async () => {
    sessionState = user(['WAREHOUSE_STAFF'], ['WH-HCM-01'])
    renderInventory()
    await screen.findByRole('row', { name: /BP-1/ })
    expect(screen.queryByRole('button', { name: 'Add opening stock' })).not.toBeInTheDocument()
    expect(screen.getByText(/Only warehouse managers can record opening stock/)).toBeInTheDocument()
  })

  it('shows validation errors without calling the service', async () => {
    const actor = await openForm()
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(await screen.findByText('Enter a SKU')).toBeInTheDocument()
    expect(
      screen.getByText('Quantity must be a whole number from 1 to 1,000,000')
    ).toBeInTheDocument()
    expect(screen.getByText('Give a reason of at least 3 characters')).toBeInTheDocument()
    expect(api.postOpeningStock).not.toHaveBeenCalled()
  })

  it('records opening stock and confirms', async () => {
    api.postOpeningStock.mockResolvedValue(undefined)
    const actor = await openForm()
    await actor.type(screen.getByLabelText('SKU'), ' BP-1 ')
    await actor.type(screen.getByLabelText('Quantity'), '25')
    await actor.type(screen.getByLabelText('Reason'), 'Cycle count')
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(api.postOpeningStock).toHaveBeenCalledWith({
      skuId: 'BP-1',
      warehouseId: 'WH-HCM-01',
      qty: 25,
      reason: 'Cycle count',
    })
    expect(
      await screen.findByText('Recorded 25 units of opening stock for BP-1 in WH-HCM-01.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Add opening stock' })).not.toBeInTheDocument()
  })

  it('shows the field errors the service sends', async () => {
    api.postOpeningStock.mockRejectedValue(
      apiError(422, 'VALIDATION_FAILED', { skuId: ['This SKU does not exist'] })
    )
    const actor = await openForm()
    await actor.type(screen.getByLabelText('SKU'), 'NOPE')
    await actor.type(screen.getByLabelText('Quantity'), '5')
    await actor.type(screen.getByLabelText('Reason'), 'Count')
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(await screen.findByText('This SKU does not exist')).toBeInTheDocument()
  })

  it('explains that opening stock can be recorded only once per SKU and warehouse', async () => {
    api.postOpeningStock.mockRejectedValue(apiError(409, 'OPENING_STOCK_ALREADY_RECORDED'))
    const actor = await openForm()
    await actor.type(screen.getByLabelText('SKU'), 'BP-1')
    await actor.type(screen.getByLabelText('Quantity'), '5')
    await actor.type(screen.getByLabelText('Reason'), 'Count')
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already recorded.*only once/)
  })

  it('shows the message of a rejected request', async () => {
    api.postOpeningStock.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'every line needs a skuId and a positive quantity',
      })
    )
    const actor = await openForm()
    await actor.type(screen.getByLabelText('SKU'), 'BP-1')
    await actor.type(screen.getByLabelText('Quantity'), '5')
    await actor.type(screen.getByLabelText('Reason'), 'Count')
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/every line needs a skuId/)
  })

  it('explains a refusal for a warehouse outside the scope', async () => {
    api.postOpeningStock.mockRejectedValue(apiError(403, 'WAREHOUSE_FORBIDDEN'))
    const actor = await openForm()
    await actor.type(screen.getByLabelText('SKU'), 'BP-1')
    await actor.type(screen.getByLabelText('Quantity'), '5')
    await actor.type(screen.getByLabelText('Reason'), 'Count')
    await actor.click(screen.getByRole('button', { name: 'Record opening stock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/outside your warehouses/)
  })

  it('lets a manager of every warehouse choose the warehouse', async () => {
    sessionState = user(['WAREHOUSE_MGR'], ['ALL'])
    const actor = await openForm()
    const panel = screen.getByRole('region', { name: 'Add opening stock' })
    const select = within(panel).getByLabelText('Warehouse')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['WH-HCM-01', 'WH-HN-01'])
    await actor.selectOptions(select, 'WH-HN-01')
    expect(select).toHaveValue('WH-HN-01')
  })

  it('closes with Escape', async () => {
    const actor = await openForm()
    await actor.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Add opening stock' })).not.toBeInTheDocument()
  })
})
