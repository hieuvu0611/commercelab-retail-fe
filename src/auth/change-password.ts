import type { JWT } from 'next-auth/jwt'
import { z } from 'zod'
import { IamError, type IamClient } from './types'

/** Stop using an access token this close to its expiry; the browser refreshes the session first. */
const EXPIRY_LEEWAY_MS = 10_000

const bodySchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) })

export interface ChangePasswordResult {
  status: number
  body: Record<string, unknown>
}

interface Options {
  /** The decrypted session cookie (null when signed out). It is read without refreshing it. */
  token: JWT | null
  body: unknown
  iam: IamClient
  now?: () => number
}

/**
 * Changes the password on the server side of the app so the fresh session the identity service returns
 * (including a refresh token) never reaches browser code. The browser then signs in again with the new password.
 */
export async function handleChangePassword({
  token,
  body,
  iam,
  now = Date.now,
}: Options): Promise<ChangePasswordResult> {
  const accessToken = token && !token.error ? token.accessToken : undefined
  const expires = token?.accessTokenExpires
  if (!accessToken || (expires !== undefined && expires - EXPIRY_LEEWAY_MS <= now())) {
    return { status: 401, body: { code: 'SESSION_EXPIRED' } }
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { status: 400, body: { code: 'INVALID_REQUEST' } }

  try {
    await iam.changePassword(accessToken, parsed.data.currentPassword, parsed.data.newPassword)
    return { status: 200, body: { ok: true } }
  } catch (error) {
    if (error instanceof IamError) {
      if (error.status === 422)
        return { status: 422, body: { code: error.code, fieldErrors: error.fieldErrors } }
      if (error.status === 403 || error.status === 429)
        return { status: error.status, body: { code: error.code } }
      if (error.status === 401) return { status: 401, body: { code: 'SESSION_EXPIRED' } }
    }
    return { status: 503, body: { code: 'SERVICE_UNAVAILABLE' } }
  }
}
