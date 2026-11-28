import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteAccountForm } from '../delete-account-form'

const useSessionMock = jest.fn()
const getSessionMock = jest.fn()
const signOutMock = jest.fn()
const fetchMock = jest.fn()

jest.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
  getSession: () => getSessionMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

const PASSWORD = 'old-password-123'

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  useSessionMock.mockReset().mockReturnValue({
    data: { user: { email: 'lan@example.com', roles: ['CUSTOMER'] } },
    status: 'authenticated',
  })
  getSessionMock.mockReset().mockResolvedValue({})
  signOutMock.mockReset().mockResolvedValue(undefined)
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

async function fillAndSubmit(password = PASSWORD, confirmation = 'DELETE') {
  const user = userEvent.setup()
  if (password) await user.type(screen.getByLabelText('Current password'), password)
  if (confirmation) await user.type(screen.getByLabelText('Type DELETE to confirm'), confirmation)
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
}

describe('DeleteAccountForm', () => {
  it('explains anonymization, 10-year order/ledger retention, and immediate sign-out', () => {
    render(<DeleteAccountForm />)
    expect(screen.getByText(/permanent and cannot be undone/i)).toBeInTheDocument()
    expect(screen.getByText(/name, email address, phone number, and saved addresses/i)).toBeInTheDocument()
    expect(screen.getByText(/retained for 10 years/i)).toBeInTheDocument()
    expect(screen.getByText(/signed out of all devices immediately/i)).toBeInTheDocument()
  })

  it('requires DELETE confirmation and current password before calling the server', async () => {
    render(<DeleteAccountForm />)

    await fillAndSubmit('', 'delete')

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(screen.getByText('Type DELETE to confirm account deletion')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deletes the account and signs out to /login?deleted=1 on success', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    render(<DeleteAccountForm />)

    await fillAndSubmit(PASSWORD, ' DELETE ')

    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/login?deleted=1' })
    )
    expect(getSessionMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/account/delete')
    expect(JSON.parse(init.body)).toEqual({
      currentPassword: PASSWORD,
      confirmation: 'DELETE',
    })
  })

  it('shows a wrong current password error on the password field and does not sign out', async () => {
    fetchMock.mockReturnValue(respond(403, { code: 'INVALID_CURRENT_PASSWORD' }))
    render(<DeleteAccountForm />)

    await fillAndSubmit()

    expect(await screen.findByText('The current password is not correct.')).toBeInTheDocument()
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it.each([
    [403, { code: 'STAFF_ACCOUNT_CANNOT_SELF_DELETE' }, /staff accounts cannot be self-deleted/i],
    [429, { code: 'TOO_MANY_ATTEMPTS' }, /too many failed attempts/i],
    [401, { code: 'SESSION_EXPIRED' }, /session has expired/i],
    [503, { code: 'SERVICE_UNAVAILABLE' }, /temporarily unavailable/i],
    [500, {}, /could not delete your account/i],
  ])('maps a %i server error to an alert', async (status, body, expected) => {
    fetchMock.mockReturnValue(respond(status, body))
    render(<DeleteAccountForm />)

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('blocks staff accounts from self-deleting and hides the submission form', () => {
    useSessionMock.mockReturnValue({
      data: { user: { email: 'admin@commercelab.vn', roles: ['ACCESS_ADMIN'] } },
      status: 'authenticated',
    })
    render(<DeleteAccountForm />)

    expect(screen.getByRole('status')).toHaveTextContent(
      /staff accounts cannot be self-deleted.*access administrator/i
    )
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })

  it('shows a deleted status banner and keeps submit disabled when signOut rejects', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    signOutMock.mockRejectedValueOnce(new Error('signout failed'))
    render(<DeleteAccountForm />)

    await fillAndSubmit()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your account was deleted and anonymized, but we could not finish signing out automatically. Reload or close this tab.'
    )
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sets uppercase autocapitalization and disables spellcheck on the confirmation field', () => {
    render(<DeleteAccountForm />)
    const confirmationInput = screen.getByLabelText('Type DELETE to confirm')

    expect(confirmationInput).toHaveAttribute('autocapitalize', 'characters')
    expect(confirmationInput).toHaveAttribute('spellcheck', 'false')
  })
})
