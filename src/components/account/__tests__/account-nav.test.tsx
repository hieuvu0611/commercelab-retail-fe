import { render, screen } from '@testing-library/react'
import { AccountNav } from '../account-nav'

let pathname = '/account'
jest.mock('next/navigation', () => ({ usePathname: () => pathname }))

describe('AccountNav', () => {
  it('marks the current section', () => {
    pathname = '/account/security'
    render(<AccountNav />)

    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account')
  })

  it('marks the profile on /account', () => {
    pathname = '/account'
    render(<AccountNav />)

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })
})
