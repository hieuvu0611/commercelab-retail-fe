import type { JWT } from 'next-auth/jwt'
import type { Session, User } from 'next-auth'
import { LoginSchema } from '@/validations/auth'
import { IamError, REFRESH_ERROR, type IamClient, type RefreshedTokens } from './types'

/** Refresh this long before the access token really expires. */
const REFRESH_LEEWAY_MS = 30_000

interface Options {
  iam: IamClient
  now?: () => number
}

/** The NextAuth callbacks, with the IAM client injected so they can be tested without a server. */
export function createAuthCallbacks({ iam, now = Date.now }: Options) {
  // The server revokes a refresh token that is presented twice, so parallel requests must share one refresh.
  const inFlight = new Map<string, Promise<RefreshedTokens>>()

  function refreshOnce(refreshToken: string): Promise<RefreshedTokens> {
    const running = inFlight.get(refreshToken)
    if (running) return running
    const started = iam.refresh(refreshToken).finally(() => {
      inFlight.delete(refreshToken)
    })
    inFlight.set(refreshToken, started)
    return started
  }

  async function authorize(credentials: Record<string, string> | undefined): Promise<User | null> {
    const parsed = LoginSchema.pick({ email: true }).safeParse({ email: credentials?.email })
    const password = credentials?.password
    if (!parsed.success || !password) return null

    try {
      const session = await iam.login(parsed.data.email, password)
      return { id: session.user.id, ...session }
    } catch (error) {
      if (error instanceof IamError) {
        if (error.status === 401) return null
        if (error.status === 429) throw new Error('TOO_MANY_ATTEMPTS')
      }
      throw new Error('SERVICE_UNAVAILABLE')
    }
  }

  // The browser may ask to refresh the shown name and phone after a profile edit. Only those two fields are
  // accepted (never tokens or roles), and the server remains the source of truth on the next sign-in.
  function applyProfileUpdate(token: JWT, update: unknown): JWT {
    if (!token.user || update === null || typeof update !== 'object') return token
    const { name, phone } = update as { name?: unknown; phone?: unknown }
    const user = { ...token.user }
    if (typeof name === 'string' && name.trim().length > 0 && name.length <= 100)
      user.name = name.trim()
    if (typeof phone === 'string' && phone.length <= 20) user.phone = phone
    return { ...token, user }
  }

  async function jwt({
    token,
    user,
    trigger,
    session: update,
  }: {
    token: JWT
    user?: User
    trigger?: 'signIn' | 'signUp' | 'update'
    session?: unknown
  }): Promise<JWT> {
    if (user) {
      return {
        user: user.user,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
        accessTokenExpires: user.accessTokenExpires,
      }
    }
    if (token.error) return token
    if (trigger === 'update') return applyProfileUpdate(token, update)
    if (token.accessTokenExpires && now() < token.accessTokenExpires - REFRESH_LEEWAY_MS)
      return token
    if (!token.refreshToken) return { error: REFRESH_ERROR }

    try {
      const refreshed = await refreshOnce(token.refreshToken)
      return { ...token, ...refreshed, error: undefined }
    } catch {
      // The refresh token is dead or the server is unreachable: end the session instead of keeping a stale one.
      return { error: REFRESH_ERROR }
    }
  }

  async function session({
    session: current,
    token,
  }: {
    session: Session
    token: JWT
  }): Promise<Session> {
    if (token.error) {
      // Never expose the old user or tokens once the session failed.
      return { expires: current.expires, error: token.error }
    }
    return { ...current, user: token.user, accessToken: token.accessToken }
  }

  /** Revokes the server-side session when the user signs out. A failure must not block the sign-out. */
  async function onSignOut(token: JWT): Promise<void> {
    if (!token.refreshToken) return
    try {
      await iam.logout(token.refreshToken)
    } catch {
      // The cookie is cleared regardless; the refresh token also expires on its own.
    }
  }

  return { authorize, jwt, session, onSignOut }
}
