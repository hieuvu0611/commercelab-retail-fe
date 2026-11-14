import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangePasswordForm } from '../change-password-form'

const getSessionMock = jest.fn()
const signInMock = jest.fn()
const fetchMock = jest.fn()

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'lan@example.com' } }, status: 'authenticated' }),
  getSession: () => getSessionMock(),
  signIn: (...args: unknown[]) => signInMock(...args),
}))

const OLD = 'old-password-123'
const NEW = 'a-brand-new-password'

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  getSessionMock.mockReset().mockResolvedValue({})
  signInMock.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

async function fill(current = OLD, next = NEW, repeat = NEW) {
  const user = userEvent.setup()
  if (current) await user.type(screen.getByLabelText('Current password'), current)
  if (next) await user.type(screen.getByLabelText('New password'), next)
  if (repeat) await user.type(screen.getByLabelText('Repeat new password'), repeat)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordForm', () => {
  it('tells people that other devices will be signed out', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByText(/signs you out of every other device/i)).toBeInTheDocument()
  })

  it('checks the new password before calling the server', async () => {
    render(<ChangePasswordForm />)

    await fill(OLD, 'short', 'different')

    expect(await screen.findByText('Password must be at least 10 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('changes the password, signs this device in again with the new one and confirms', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    signInMock.mockResolvedValue({ ok: true })
    render(<ChangePasswordForm />)

    await fill()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/other devices were signed out/i)
    )
    expect(getSessionMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/account/change-password')
    expect(JSON.parse(init.body)).toEqual({ currentPassword: OLD, newPassword: NEW })
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'lan@example.com',
      password: NEW,
    })
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('shows a wrong current password on that field and does not sign in again', async () => {
    fetchMock.mockReturnValue(respond(403, { code: 'INVALID_CURRENT_PASSWORD' }))
    render(<ChangePasswordForm />)

    await fill()

    expect(await screen.findByText('The current password is not correct.')).toBeInTheDocument()
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('shows the server rule it broke next to the new password', async () => {
    fetchMock.mockReturnValue(
      respond(422, {
        code: 'VALIDATION_FAILED',
        fieldErrors: { newPassword: ['Server rule broken'] },
      })
    )
    render(<ChangePasswordForm />)

    await fill()

    expect(await screen.findByText('Server rule broken')).toBeInTheDocument()
  })

  it.each([
    [429, { code: 'TOO_MANY_ATTEMPTS' }, /too many failed attempts/i],
    [401, { code: 'SESSION_EXPIRED' }, /session has expired/i],
    [503, { code: 'SERVICE_UNAVAILABLE' }, /temporarily unavailable/i],
    [500, {}, /could not change your password/i],
  ])('explains a %i answer', async (status, body, expected) => {
    fetchMock.mockReturnValue(respond(status, body))
    render(<ChangePasswordForm />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
  })

  it('explains a network failure', async () => {
    fetchMock.mockReturnValue(Promise.reject(new TypeError('fetch failed')))
    render(<ChangePasswordForm />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
  })

  it('tells people to sign in again when the change worked but the new sign-in did not', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    signInMock.mockResolvedValue({ ok: false, error: 'SERVICE_UNAVAILABLE' })
    render(<ChangePasswordForm />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /password was changed, but we could not keep you signed in/i
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
