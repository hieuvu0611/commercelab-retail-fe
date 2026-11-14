import type { JWT } from 'next-auth/jwt'
import type { SessionUser } from './types'

export type AccessDecision = { action: 'allow' } | { action: 'redirect'; to: string }

const CUSTOMER_ROLE = 'CUSTOMER'

/** Staff are people with at least one role other than CUSTOMER. */
export function isStaff(user: Pick<SessionUser, 'roles'> | undefined): boolean {
  return (user?.roles ?? []).some((role) => role !== CUSTOMER_ROLE)
}

function isInside(pathname: string, area: string): boolean {
  return pathname === area || pathname.startsWith(`${area}/`)
}

function signInUrl(loginPath: string, pathname: string, search: string): string {
  return `${loginPath}?callbackUrl=${encodeURIComponent(pathname + search)}`
}

/**
 * Decides whether a request may continue. `token` is the decrypted NextAuth JWT (null when signed out).
 *
 * - /account/** needs any signed-in user.
 * - /admin/** needs a staff user: signed-out visitors go to /admin/login, signed-in customers to /unauthorized.
 * - /admin/login is never guarded, otherwise signed-out staff would loop between the guard and the sign-in page.
 *
 * A session whose refresh failed counts as signed out. This is a convenience for navigation; every API call is
 * authorized again by the services themselves.
 */
export function decideAccess(pathname: string, search: string, token: JWT | null): AccessDecision {
  const user = token && !token.error ? token.user : undefined

  if (isInside(pathname, '/account')) {
    return user
      ? { action: 'allow' }
      : { action: 'redirect', to: signInUrl('/login', pathname, search) }
  }

  if (isInside(pathname, '/admin') && !isInside(pathname, '/admin/login')) {
    if (!user) return { action: 'redirect', to: signInUrl('/admin/login', pathname, search) }
    return isStaff(user) ? { action: 'allow' } : { action: 'redirect', to: '/unauthorized' }
  }

  return { action: 'allow' }
}
