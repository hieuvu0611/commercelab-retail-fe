import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '../register-form'

const push = jest.fn()
const refresh = jest.fn()
const signInMock = jest.fn()
const fetchMock = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('next-auth/react', () => ({
  signIn: (provider: string, options: Record<string, unknown>) => signInMock(provider, options),
}))

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  push.mockReset()
  refresh.mockReset()
  signInMock.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const VALID = {
  fullName: 'Lan Nguyen',
  email: 'Lan@Example.com',
  password: 'a-long-enough-password',
}

async function fill(values: Partial<typeof VALID & { repeat: string }> = {}) {
  const user = userEvent.setup()
  const data = { ...VALID, repeat: VALID.password, ...values }
  if (data.fullName) await user.type(screen.getByLabelText('Full name'), data.fullName)
  if (data.email) await user.type(screen.getByLabelText('Email'), data.email)
  if (data.password) await user.type(screen.getByLabelText('Password'), data.password)
  if (data.repeat) await user.type(screen.getByLabelText('Repeat password'), data.repeat)
  await user.click(screen.getByRole('button', { name: /create account/i }))
}

describe('RegisterForm', () => {
  it('checks the password rules before calling the server', async () => {
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill({ password: 'short', repeat: 'different' })

    expect(await screen.findByText('Password must be at least 10 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("registers through the app's own server, signs in and goes to the callback URL", async () => {
    fetchMock.mockReturnValue(respond(201, { ok: true }))
    signInMock.mockResolvedValue({ ok: true })
    render(<RegisterForm callbackUrl="/account" loginHref="/login" />)

    await fill()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/account'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/account/register')
    expect(JSON.parse(init.body)).toEqual({
      email: 'lan@example.com',
      password: VALID.password,
      fullName: 'Lan Nguyen',
    })
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'lan@example.com',
      password: VALID.password,
    })
  })

  it('shows "email already registered" on the email field', async () => {
    fetchMock.mockReturnValue(respond(409, { code: 'EMAIL_ALREADY_REGISTERED' }))
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(signInMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('puts server field errors next to their fields', async () => {
    fetchMock.mockReturnValue(
      respond(422, {
        code: 'VALIDATION_FAILED',
        fieldErrors: {
          password: ['The server does not like this password'],
          fullName: ['Server name problem'],
        },
      })
    )
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByText('The server does not like this password')).toBeInTheDocument()
    expect(screen.getByText('Server name problem')).toBeInTheDocument()
  })

  it.each([
    [429, { code: 'TOO_MANY_ATTEMPTS' }, /too many attempts/i],
    [503, { code: 'SERVICE_UNAVAILABLE' }, /temporarily unavailable/i],
    [500, {}, /could not create your account/i],
  ])('explains a %i answer in plain words', async (status, body, expected) => {
    fetchMock.mockReturnValue(respond(status, body))
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
  })

  it('explains a network failure', async () => {
    fetchMock.mockReturnValue(Promise.reject(new TypeError('fetch failed')))
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
  })

  it('tells the user when the account was created but sign-in failed', async () => {
    fetchMock.mockReturnValue(respond(201, { ok: true }))
    signInMock.mockResolvedValue({ ok: false, error: 'SERVICE_UNAVAILABLE' })
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(/account was created/i)
    expect(push).not.toHaveBeenCalled()
  })

  it('links to the sign-in page', () => {
    render(<RegisterForm callbackUrl="/" loginHref="/login?callbackUrl=%2Faccount" />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Faccount'
    )
  })
})
