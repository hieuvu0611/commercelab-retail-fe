import { z } from 'zod'
import { IamError, type IamClient, type IamSession, type RefreshedTokens } from './types'

const REQUEST_TIMEOUT_MS = 10_000
/** Used when an access token carries no readable expiry: refresh soon rather than trust it for long. */
const FALLBACK_LIFETIME_MS = 60_000

/** Reads the `exp` claim (seconds) of a JWT as milliseconds since the epoch. The signature is not checked here. */
export function tokenExpiry(accessToken: string, now: number): number {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')
    )
    if (typeof payload?.exp === 'number') return payload.exp * 1000
  } catch {
    // fall through to the fallback below
  }
  return now + FALLBACK_LIFETIME_MS
}

const loginSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    roles: z.array(z.string()).default([]),
    warehouseScopes: z.array(z.string()).default([]),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
})

const refreshSchema = z.object({
  data: z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }),
})

const errorSchema = z.object({ code: z.string() })

interface Options {
  /** Base URL ending in /api/v1 (decision D-10). */
  baseUrl: string | undefined
  fetchImpl?: typeof fetch
  now?: () => number
}

/** The IAM client used on the server (NextAuth). It calls the gateway; the browser never sees the refresh token. */
export function createHttpIamClient({
  baseUrl,
  fetchImpl = fetch,
  now = Date.now,
}: Options): IamClient {
  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    if (!baseUrl) throw new IamError(0, 'API_BASE_URL_MISSING')
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
    const payload: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const parsed = errorSchema.safeParse(payload)
      throw new IamError(response.status, parsed.success ? parsed.data.code : 'UNKNOWN_ERROR')
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new IamError(response.status, 'INVALID_RESPONSE')
    return parsed.data
  }

  return {
    async login(email, password): Promise<IamSession> {
      const { data } = await post('/auth/login', { email, password }, loginSchema)
      return {
        user: {
          id: data.id,
          name: data.name,
          email: data.email,
          ...(data.phone !== undefined && { phone: data.phone }),
          roles: data.roles,
          warehouseScopes: data.warehouseScopes,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpires: tokenExpiry(data.accessToken, now()),
      }
    },

    async refresh(refreshToken): Promise<RefreshedTokens> {
      const { data } = await post('/auth/refresh', { refreshToken }, refreshSchema)
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpires: tokenExpiry(data.accessToken, now()),
      }
    },
  }
}
