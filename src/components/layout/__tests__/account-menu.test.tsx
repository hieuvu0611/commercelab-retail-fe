import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenu } from '../account-menu'

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

  it('closes when the user clicks outside', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
