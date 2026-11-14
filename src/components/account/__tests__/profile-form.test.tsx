import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import { ProfileForm } from '../profile-form'

const getMock = jest.fn()
const patchMock = jest.fn()
const updateMock = jest.fn()
let sessionState: { data: unknown; status: string; update: typeof updateMock }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('@/services/api/clients', () => ({
  storefrontApi: {
    get: (...args: unknown[]) => getMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}))

const PROFILE = {
  id: 'user-lan',
  name: 'Lan Nguyen',
  email: 'lan@example.com',
  phone: '+84901234567',
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProfileForm />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  getMock.mockReset()
  patchMock.mockReset()
  updateMock.mockReset()
  sessionState = {
    data: { accessToken: 'access-1', user: { id: 'user-lan' } },
    status: 'authenticated',
    update: updateMock,
  }
})

describe('ProfileForm', () => {
  it('loads and shows the details, with the email read-only', async () => {
    getMock.mockResolvedValue({ data: PROFILE })
    renderForm()

    expect(await screen.findByLabelText('Full name')).toHaveValue('Lan Nguyen')
    expect(screen.getByLabelText('Phone (optional)')).toHaveValue('+84901234567')
    expect(screen.getByLabelText('Email')).toHaveValue('lan@example.com')
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
    expect(getMock).toHaveBeenCalledWith('/auth/me')
  })

  it('does not call the server before the session has a token', () => {
    sessionState = { data: null, status: 'loading', update: updateMock }
    renderForm()

    expect(screen.getByRole('status')).toHaveTextContent('Loading your details')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('says so when the details cannot be loaded', async () => {
    getMock.mockRejectedValue(
      new ApiError({ kind: 'network', status: 0, code: 'NETWORK_ERROR', message: 'x' })
    )
    renderForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your details/i)
  })

  it('saves the changes, confirms, and refreshes the name shown in the header', async () => {
    getMock.mockResolvedValue({ data: PROFILE })
    patchMock.mockResolvedValue({ data: { ...PROFILE, name: 'Lan N.', phone: '' } })
    const user = userEvent.setup()
    renderForm()

    const name = await screen.findByLabelText('Full name')
    await user.clear(name)
    await user.type(name, '  Lan N.  ')
    await user.clear(screen.getByLabelText('Phone (optional)'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Your details were saved.')
    )
    expect(patchMock).toHaveBeenCalledWith(
      '/auth/me',
      { fullName: 'Lan N.', phone: '' },
      { skipUnauthorizedHandler: true }
    )
    expect(updateMock).toHaveBeenCalledWith({ name: 'Lan N.', phone: '' })
  })

  it('checks the input before calling the server', async () => {
    getMock.mockResolvedValue({ data: PROFILE })
    const user = userEvent.setup()
    renderForm()

    const name = await screen.findByLabelText('Full name')
    await user.clear(name)
    await user.clear(screen.getByLabelText('Phone (optional)'))
    await user.type(screen.getByLabelText('Phone (optional)'), 'call me')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter your full name')).toBeInTheDocument()
    expect(screen.getByText('Enter an international number of 7 to 15 digits')).toBeInTheDocument()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('puts server field errors next to their fields', async () => {
    getMock.mockResolvedValue({ data: PROFILE })
    patchMock.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'x',
        fieldErrors: { phone: ['Server says no to this phone'] },
      })
    )
    const user = userEvent.setup()
    renderForm()

    await screen.findByLabelText('Full name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Server says no to this phone')).toBeInTheDocument()
    expect(screen.queryByText('Your details were saved.')).not.toBeInTheDocument()
  })

  it('explains an outage', async () => {
    getMock.mockResolvedValue({ data: PROFILE })
    patchMock.mockRejectedValue(
      new ApiError({ kind: 'http', status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'x' })
    )
    const user = userEvent.setup()
    renderForm()

    await screen.findByLabelText('Full name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
  })
})
