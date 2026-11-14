import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/api/api-error'
import { RegisterForm } from '../register-form'

const push = jest.fn()
const refresh = jest.fn()
const signInMock = jest.fn()
const postMock = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('next-auth/react', () => ({
  signIn: (provider: string, options: Record<string, unknown>) => signInMock(provider, options),
}))
jest.mock('@/services/api/clients', () => ({
  storefrontApi: {
    post: (url: string, body: unknown, config?: unknown) => postMock(url, body, config),
  },
}))

beforeEach(() => {
  push.mockReset()
  refresh.mockReset()
  signInMock.mockReset()
  postMock.mockReset()
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
    expect(postMock).not.toHaveBeenCalled()
  })

  it('creates the account, signs in and goes to the callback URL', async () => {
    postMock.mockResolvedValue({ data: {} })
    signInMock.mockResolvedValue({ ok: true })
    render(<RegisterForm callbackUrl="/account" loginHref="/login" />)

    await fill()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/account'))
    expect(postMock).toHaveBeenCalledWith(
      '/auth/register',
      { email: 'lan@example.com', password: VALID.password, fullName: 'Lan Nguyen' },
      { skipUnauthorizedHandler: true }
    )
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'lan@example.com',
      password: VALID.password,
    })
  })

  it('shows "email already registered" on the email field', async () => {
    postMock.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'taken',
      })
    )
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(signInMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('puts server field errors next to their fields', async () => {
    postMock.mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
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
    [
      new ApiError({ kind: 'http', status: 429, code: 'TOO_MANY_ATTEMPTS', message: 'x' }),
      /too many attempts/i,
    ],
    [
      new ApiError({ kind: 'http', status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'x' }),
      /temporarily unavailable/i,
    ],
    [
      new ApiError({ kind: 'network', status: 0, code: 'NETWORK_ERROR', message: 'x' }),
      /temporarily unavailable/i,
    ],
    [
      new ApiError({ kind: 'http', status: 500, code: 'X', message: 'x' }),
      /could not create your account/i,
    ],
  ])('explains other failures in plain words', async (error, expected) => {
    postMock.mockRejectedValue(error)
    render(<RegisterForm callbackUrl="/" loginHref="/login" />)

    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
  })

  it('tells the user when the account was created but sign-in failed', async () => {
    postMock.mockResolvedValue({ data: {} })
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
