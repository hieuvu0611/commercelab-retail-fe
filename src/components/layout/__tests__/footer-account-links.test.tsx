import { render, screen } from '@testing-library/react'
import { FooterAccountLinks } from '../footer-account-links'

let sessionState: { data: unknown; status: 'authenticated' | 'unauthenticated' | 'loading' } = {
  data: null,
  status: 'unauthenticated',
}

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))

describe('FooterAccountLinks', () => {
  it('offers sign-in and registration to visitors', () => {
    sessionState = { data: null, status: 'unauthenticated' }
    render(<FooterAccountLinks />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register'
    )
    expect(screen.getByRole('link', { name: 'Staff sign-in' })).toHaveAttribute(
      'href',
      '/admin/login'
    )
  })

  it('offers only the account page to signed-in people', () => {
    sessionState = {
      data: {
        user: { id: 'u1', name: 'Lan', email: 'l@e.com', roles: ['CUSTOMER'], warehouseScopes: [] },
      },
      status: 'authenticated',
    }
    render(<FooterAccountLinks />)

    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('treats a failed session as signed out', () => {
    sessionState = { data: { error: 'RefreshAccessTokenError' }, status: 'authenticated' }
    render(<FooterAccountLinks />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
