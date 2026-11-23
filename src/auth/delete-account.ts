import type { JWT } from 'next-auth/jwt'
import { z } from 'zod'
import { IamError, type IamClient } from './types'

const EXPIRY_LEEWAY_MS = 10_000

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  confirmation: z.string().min(1),
})

export interface DeleteAccountResult {
  status: number
  body: Record<string, unknown>
}

interface Options {
  token: JWT | null
  body: unknown
  iam: IamClient
  now?: () => number
}

export async function handleDeleteAccount({
  token,
  body,
  iam,
  now = Date.now,
}: Options): Promise<DeleteAccountResult> {
  const accessToken = token && !token.error ? token.accessToken : undefined
  const expires = token?.accessTokenExpires
  if (!accessToken || (expires !== undefined && expires - EXPIRY_LEEWAY_MS <= now())) {
    return { status: 401, body: { code: 'SESSION_EXPIRED' } }
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { status: 400, body: { code: 'INVALID_REQUEST' } }

  try {
    await iam.deleteAccount(accessToken, parsed.data.currentPassword, parsed.data.confirmation)
    return { status: 200, body: { ok: true } }
  } catch (error) {
    if (error instanceof IamError) {
      if (error.status === 422) {
        return { status: 422, body: { code: error.code, fieldErrors: error.fieldErrors } }
      }
      if (error.status === 403 || error.status === 429) {
        return { status: error.status, body: { code: error.code } }
      }
      if (error.status === 401) return { status: 401, body: { code: 'SESSION_EXPIRED' } }
    }
    return { status: 503, body: { code: 'SERVICE_UNAVAILABLE' } }
  }
}
