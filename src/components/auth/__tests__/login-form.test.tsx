import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../login-form'

const push = jest.fn()
const refresh = jest.fn()
const signInMock = jest.fn()
const getSessionMock = jest.fn()
const signOutMock = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('next-auth/react', () => ({
  signIn: (provider: string, options: Record<string, unknown>) => signInMock(provider, options),
  getSession: () => getSessionMock(),
  signOut: (options: unknown) => signOutMock(options),
}))

beforeEach(() => {
  push.mockReset()
  refresh.mockReset()
  signInMock.mockReset()
  getSessionMock.mockReset()
  signOutMock.mockReset()
})

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('LoginForm', () => {
  it('shows what is missing and does not call the server for an empty form', async () => {
    render(<LoginForm callbackUrl="/" />)

    await fillAndSubmit('', '')

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('signs in with the typed credentials and goes to the callback URL', async () => {
    signInMock.mockResolvedValue({ ok: true, error: undefined })
    render(<LoginForm callbackUrl="/account" />)

    await fillAndSubmit('Lan@Example.com', 'secret-password')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/account'))
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'lan@example.com',
      password: 'secret-password',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('never follows a callback URL that leaves the site', async () => {
    signInMock.mockResolvedValue({ ok: true })
    render(<LoginForm callbackUrl="https://evil.example/phish" />)

    await fillAndSubmit('lan@example.com', 'secret-password')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it.each([
    ['CredentialsSignin', 'The email or password is not correct.'],
    ['TOO_MANY_ATTEMPTS', 'Too many failed attempts. Wait a few minutes and try again.'],
    ['SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again shortly.'],
    ['SomethingElse', 'We could not sign you in. Please try again.'],
  ])('explains a %s failure and stays on the page', async (code, message) => {
    signInMock.mockResolvedValue({ ok: false, error: code })
    render(<LoginForm callbackUrl="/" />)

    await fillAndSubmit('lan@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('disables the button while signing in', async () => {
    let finish: (value: unknown) => void = () => {}
    signInMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<LoginForm callbackUrl="/" />)

    await fillAndSubmit('lan@example.com', 'secret-password')

    const busy = await screen.findByRole('button', { name: /signing in/i })
    expect(busy).toBeDisabled()
    finish({ ok: true })
    await waitFor(() => expect(push).toHaveBeenCalled())
  })

  it('links to registration when asked to', () => {
    render(<LoginForm callbackUrl="/" registerHref="/register?callbackUrl=%2Faccount" />)
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?callbackUrl=%2Faccount'
    )
  })

  describe('staff sign-in', () => {
    it('lets staff through to the backoffice', async () => {
      signInMock.mockResolvedValue({ ok: true })
      getSessionMock.mockResolvedValue({ user: { roles: ['WAREHOUSE_STAFF'] } })
      render(<LoginForm callbackUrl="/admin" heading="Staff sign-in" requireStaff />)

      await fillAndSubmit('wh@commercelab.vn', 'secret-password')

      await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'))
      expect(signOutMock).not.toHaveBeenCalled()
    })

    it('signs a customer out again and explains why', async () => {
      signInMock.mockResolvedValue({ ok: true })
      getSessionMock.mockResolvedValue({ user: { roles: ['CUSTOMER'] } })
      render(<LoginForm callbackUrl="/admin" heading="Staff sign-in" requireStaff />)

      await fillAndSubmit('lan@example.com', 'secret-password')

      expect(await screen.findByRole('alert')).toHaveTextContent(/does not have backoffice access/i)
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false })
      expect(push).not.toHaveBeenCalled()
    })

    it('does not check the roles on the shop sign-in', async () => {
      signInMock.mockResolvedValue({ ok: true })
      render(<LoginForm callbackUrl="/account" />)

      await fillAndSubmit('lan@example.com', 'secret-password')

      await waitFor(() => expect(push).toHaveBeenCalledWith('/account'))
      expect(getSessionMock).not.toHaveBeenCalled()
    })
  })
})
