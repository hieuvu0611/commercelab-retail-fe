import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { createAuthCallbacks } from './callbacks'
import { createHttpIamClient } from './iam-client'
import { isMockModeAllowed, isMockModeRequested } from './mock-guard'
import { createMockIamClient } from './mock-iam'
import { IamError, type IamClient } from './types'

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // as long as a refresh token lives (D-03)

/** In a real deployment the HTTP client; in an allowed mock run the in-process mock; otherwise nothing works. */
function selectIamClient(): IamClient {
  if (isMockModeAllowed()) return createMockIamClient()
  if (isMockModeRequested()) {
    // Mock mode in a production build without an explicit opt-in must never sign anyone in.
    const refuse = async (): Promise<never> => {
      throw new IamError(503, 'MOCK_MODE_NOT_ALLOWED')
    }
    return {
      login: refuse,
      refresh: refuse,
      logout: refuse,
      changePassword: refuse,
      register: refuse,
    }
  }
  return createHttpIamClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL })
}

/** The IAM client of this server process (HTTP, in-process mock, or refusing). */
export const iam = selectIamClient()
const callbacks = createAuthCallbacks({ iam })

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: (credentials) => callbacks.authorize(credentials),
    }),
  ],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  callbacks: { jwt: callbacks.jwt, session: callbacks.session },
  // Signing out also revokes the refresh token on the server, not only the cookie.
  events: { signOut: ({ token }) => callbacks.onSignOut(token) },
  pages: { signIn: '/login' },
}
