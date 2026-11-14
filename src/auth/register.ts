import { z } from 'zod'
import { IamError, type IamClient } from './types'

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  fullName: z.string().min(1),
})

export interface RegisterResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Registers a customer on the server side of the app, so the session the identity service starts for the new
 * account (and its refresh token) never reaches browser code. The browser then signs in with the same credentials.
 */
export async function handleRegister({
  body,
  iam,
}: {
  body: unknown
  iam: IamClient
}): Promise<RegisterResult> {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { status: 400, body: { code: 'INVALID_REQUEST' } }

  try {
    await iam.register(parsed.data.email, parsed.data.password, parsed.data.fullName)
    return { status: 201, body: { ok: true } }
  } catch (error) {
    if (error instanceof IamError) {
      if (error.status === 409) return { status: 409, body: { code: 'EMAIL_ALREADY_REGISTERED' } }
      if (error.status === 422)
        return { status: 422, body: { code: error.code, fieldErrors: error.fieldErrors } }
      if (error.status === 429) return { status: 429, body: { code: 'TOO_MANY_ATTEMPTS' } }
    }
    return { status: 503, body: { code: 'SERVICE_UNAVAILABLE' } }
  }
}
