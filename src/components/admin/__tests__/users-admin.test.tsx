import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import { UsersAdmin } from '../users-admin'

const getMock = jest.fn()
const postMock = jest.fn()
const putMock = jest.fn()
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/services/api/clients', () => ({
  storefrontApi: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}))

const ADMIN = {
  user: {
    id: 'staff-admin',
    name: 'Admin',
    email: 'admin@commercelab.vn',
    roles: ['ACCESS_ADMIN'],
    warehouseScopes: [],
  },
}
const USERS = [
  {
    id: 'staff-admin',
    email: 'admin@commercelab.vn',
    fullName: 'Access Administrator',
    isActive: true,
    roles: [{ role: 'ACCESS_ADMIN' }],
  },
  {
    id: 'staff-wh',
    email: 'wh@commercelab.vn',
    fullName: 'Warehouse HCM',
    isActive: true,
    roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HCM-01' }],
  },
  {
    id: 'staff-old',
    email: 'old@commercelab.vn',
    fullName: 'Former Staff',
    isActive: false,
    roles: [{ role: 'FINANCE' }],
  },
]

function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UsersAdmin />
    </QueryClientProvider>
  )
}

function listResponse(items = USERS, pageCount = 1) {
  return { data: items, metadata: { total: items.length, page: 1, pageCount, limit: 25 } }
}

beforeEach(() => {
  getMock.mockReset().mockResolvedValue(listResponse())
  postMock.mockReset().mockResolvedValue({ data: {} })
  putMock.mockReset().mockResolvedValue({ data: {} })
  sessionState = { data: ADMIN, status: 'authenticated' }
})

describe('UsersAdmin permissions', () => {
  it.each([
    ['a customer', ['CUSTOMER']],
    ['warehouse staff', ['WAREHOUSE_STAFF']],
    ['finance', ['FINANCE', 'FINANCE_MGR']],
  ])('shows %s a permission message and never calls the server', (_name, roles) => {
    sessionState = { data: { user: { ...ADMIN.user, roles } }, status: 'authenticated' }
    renderAdmin()

    expect(screen.getByText(/don.t have permission to manage users/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add staff user' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(getMock).not.toHaveBeenCalled()
  })

  it('waits for the session before deciding', () => {
    sessionState = { data: null, status: 'loading' }
    renderAdmin()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('UsersAdmin list', () => {
  it('lists staff with roles, warehouses and status, asking the server for staff only', async () => {
    renderAdmin()

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Warehouse HCM')).toBeInTheDocument()
    expect(within(table).getByText('Warehouse staff · WH-HCM-01')).toBeInTheDocument()
    expect(within(table).getByText('Deactivated')).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledWith('/admin/users', {
      params: { staff: true, limit: 25, offset: 0 },
    })
  })

  it('offers no actions on your own row and no deactivate on an inactive user', async () => {
    renderAdmin()
    await screen.findByRole('table')

    expect(screen.getByText(/can.t change your own access/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Change roles for Access Administrator' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change roles for Warehouse HCM' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate Warehouse HCM' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change roles for Former Staff' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Deactivate Former Staff' })
    ).not.toBeInTheDocument()
  })

  it('includes customers when asked and pages through the results', async () => {
    getMock.mockResolvedValue(listResponse(USERS, 2))
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByLabelText('Include customers'))
    await waitFor(() =>
      expect(getMock).toHaveBeenLastCalledWith('/admin/users', {
        params: { staff: false, limit: 25, offset: 0 },
      })
    )

    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(getMock).toHaveBeenLastCalledWith('/admin/users', {
        params: { staff: false, limit: 25, offset: 25 },
      })
    )
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('says so when the list cannot be loaded', async () => {
    getMock.mockRejectedValue(
      new ApiError({ kind: 'network', status: 0, code: 'NETWORK_ERROR', message: 'x' })
    )
    renderAdmin()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the users/i)
  })
})

describe('UsersAdmin actions', () => {
  it('creates a staff user with roles, a warehouse and a reason, then refreshes the list', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Add staff user' }))
    const panel = screen.getByRole('region', { name: 'Add staff user' })
    await user.type(within(panel).getByLabelText('Full name'), 'New Staff')
    await user.type(within(panel).getByLabelText('Email'), 'New.Staff@CommerceLab.vn')
    await user.type(within(panel).getByLabelText('Initial password'), 'a-long-enough-password')
    await user.click(within(panel).getByLabelText('Warehouse staff'))
    await user.selectOptions(
      within(panel).getByLabelText('Warehouse for Warehouse staff'),
      'WH-HN-01'
    )
    await user.type(within(panel).getByLabelText('Reason'), 'new hire')
    await user.click(within(panel).getByRole('button', { name: 'Create user' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('The user was created.')
    )
    expect(postMock).toHaveBeenCalledWith(
      '/admin/users',
      {
        fullName: 'New Staff',
        email: 'new.staff@commercelab.vn',
        password: 'a-long-enough-password',
        roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HN-01' }],
        reason: 'new hire',
      },
      { skipUnauthorizedHandler: true }
    )
    expect(screen.queryByRole('region', { name: 'Add staff user' })).not.toBeInTheDocument()
    expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does not call the server until the form is complete', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Add staff user' }))
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Enter the full name')).toBeInTheDocument()
    expect(screen.getByText('Choose at least one role')).toBeInTheDocument()
    expect(screen.getByText('Give a reason of at least 3 characters')).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('shows a duplicate email on the email field', async () => {
    postMock.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'EMAIL_ALREADY_REGISTERED', message: 'x' })
    )
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Add staff user' }))
    await user.type(screen.getByLabelText('Full name'), 'New Staff')
    await user.type(screen.getByLabelText('Email'), 'wh@commercelab.vn')
    await user.type(screen.getByLabelText('Initial password'), 'a-long-enough-password')
    await user.click(screen.getByLabelText('Finance'))
    await user.type(screen.getByLabelText('Reason'), 'new hire')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(
      await screen.findByText('An account with this email already exists.')
    ).toBeInTheDocument()
  })

  it('changes a user’s roles starting from their current ones', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Change roles for Warehouse HCM' }))
    const panel = screen.getByRole('region', { name: 'Change roles for Warehouse HCM' })
    expect(within(panel).getByLabelText('Warehouse staff')).toBeChecked()
    expect(within(panel).getByLabelText('Warehouse for Warehouse staff')).toHaveValue('WH-HCM-01')

    await user.click(within(panel).getByLabelText('Finance'))
    await user.type(within(panel).getByLabelText('Reason'), 'moved teams')
    await user.click(within(panel).getByRole('button', { name: 'Save roles' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Roles were updated.'))
    expect(putMock).toHaveBeenCalledWith(
      '/admin/users/staff-wh/roles',
      {
        roles: [{ role: 'WAREHOUSE_STAFF', warehouseId: 'WH-HCM-01' }, { role: 'FINANCE' }],
        reason: 'moved teams',
      },
      { skipUnauthorizedHandler: true }
    )
  })

  it('deactivates a user after a reason is given', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Deactivate Warehouse HCM' }))
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    expect(await screen.findByText('Give a reason of at least 3 characters')).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Reason'), 'left the company')
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('The account was deactivated.')
    )
    expect(postMock).toHaveBeenCalledWith(
      '/admin/users/staff-wh/deactivate',
      { reason: 'left the company' },
      { skipUnauthorizedHandler: true }
    )
  })

  it.each([
    [
      new ApiError({ kind: 'http', status: 403, code: 'CANNOT_MODIFY_OWN_ACCESS', message: 'x' }),
      /can.t change your own access/i,
    ],
    [
      new ApiError({ kind: 'http', status: 404, code: 'USER_NOT_FOUND', message: 'x' }),
      /no longer exists/i,
    ],
    [
      new ApiError({ kind: 'http', status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'x' }),
      /temporarily unavailable/i,
    ],
    [
      new ApiError({ kind: 'http', status: 500, code: 'X', message: 'x' }),
      /could not complete this change/i,
    ],
  ])('explains a failed change in plain words', async (error, expected) => {
    putMock.mockRejectedValue(error)
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Change roles for Warehouse HCM' }))
    await user.type(screen.getByLabelText('Reason'), 'moved teams')
    await user.click(screen.getByRole('button', { name: 'Save roles' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(screen.queryByText('Roles were updated.')).not.toBeInTheDocument()
  })

  it('closes a panel with Cancel without changing anything', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Deactivate Warehouse HCM' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: /Deactivate/ })).not.toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })
})
