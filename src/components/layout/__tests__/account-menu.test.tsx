import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenu } from '../account-menu'

const signOutMock = jest.fn()
let sessionState: { data: unknown; status: 'authenticated' | 'unauthenticated' | 'loading' } = {
  data: null,
  status: 'unauthenticated',
}

jest.mock('next-auth/react', () => ({
  useSession: () => sessionState,
  signOut: (options: unknown) => signOutMock(options),
}))

const customerSession = {
  data: {
    user: {
      id: 'u1',
      name: 'Lan Nguyen',
      email: 'lan@example.com',
      roles: ['CUSTOMER'],
      warehouseScopes: [],
    },
  },
  status: 'authenticated' as const,
}
const staffSession = {
  data: {
    user: {
      id: 's1',
      name: 'Wh Staff',
      email: 'wh@commercelab.vn',
      roles: ['WAREHOUSE_STAFF'],
      warehouseScopes: ['WH-HCM-01'],
    },
  },
  status: 'authenticated' as const,
}

beforeEach(() => {
  signOutMock.mockReset()
  sessionState = { data: null, status: 'unauthenticated' }
})

function renderMenu() {
  render(
    <div>
      <AccountMenu />
      <button type="button">Outside</button>
    </div>
  )
  return screen.getByRole('button', { name: 'Account' })
}

describe('AccountMenu', () => {
  it('starts closed', () => {
    const trigger = renderMenu()

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('opens on click and shows the sign-in and register links', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register'
    )
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.tab()
    await user.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when keyboard focus leaves the menu', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.tab() // Sign in
    await user.tab() // Create account
    await user.tab() // Outside

    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('leaves focus alone when Escape is pressed while the menu is closed', async () => {
    const user = userEvent.setup()
    renderMenu()
    const outside = screen.getByRole('button', { name: 'Outside' })

    outside.focus()
    await user.keyboard('{Escape}')

    expect(outside).toHaveFocus()
  })

  it('closes when the user clicks outside', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('AccountMenu when signed in', () => {
  it('shows who is signed in with account and sign-out, and no sign-in links', async () => {
    sessionState = customerSession
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)

    expect(screen.getByText('Lan Nguyen')).toBeInTheDocument()
    expect(screen.getByText('lan@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Backoffice' })).not.toBeInTheDocument()
  })

  it('offers the backoffice to staff only', async () => {
    sessionState = staffSession
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)

    expect(screen.getByRole('link', { name: 'Backoffice' })).toHaveAttribute('href', '/admin')
  })

  it('signs out and returns to the shop', async () => {
    sessionState = customerSession
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('treats a session whose refresh failed as signed out', async () => {
    sessionState = { data: { error: 'RefreshAccessTokenError' }, status: 'authenticated' }
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows the signed-out links while the session is still loading', async () => {
    sessionState = { data: null, status: 'loading' }
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
