import type { DefaultSession } from 'next-auth'

/** What the app knows about the signed-in person. */
export interface SessionUser {
  id: string
  name: string
  email: string
  phone?: string
  roles: string[]
  warehouseScopes: string[]
}

/** The result of signing in. Token expiry is in milliseconds since the epoch. */
export interface IamSession {
  user: SessionUser
  accessToken: string
  refreshToken: string
  accessTokenExpires: number
}

export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  accessTokenExpires: number
}

/** Talks to the IAM service (through the gateway). */
export interface IamClient {
  login(email: string, password: string): Promise<IamSession>
  refresh(refreshToken: string): Promise<RefreshedTokens>
  /** Revokes the refresh-token family on the server. Idempotent. */
  logout(refreshToken: string): Promise<void>
  /**
   * Changes the signed-in user's password. The server signs every other session out; the caller signs in
   * again with the new password so the refresh token never has to pass through browser code.
   */
  changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<void>
}

/** A failed IAM call. Use `code`, not the message, for behaviour. */
export class IamError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Readonly<Record<string, string[]>>

  constructor(status: number, code: string, fieldErrors: Readonly<Record<string, string[]>> = {}) {
    super(code)
    this.name = 'IamError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export const REFRESH_ERROR = 'RefreshAccessTokenError'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user?: SessionUser
    accessToken?: string
    error?: typeof REFRESH_ERROR
  }

  // The object `authorize` returns.
  interface User extends Partial<IamSession> {
    id: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    user?: SessionUser
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: typeof REFRESH_ERROR
  }
}
