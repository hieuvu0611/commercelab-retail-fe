import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { z } from 'zod'
import type { ApiResponse } from '@/types/api-response'
import { ApiError, toApiError } from './api-error'

const DEFAULT_TIMEOUT_MS = 10_000
const MOCK_BASE_URL = '/mock-api'
const HTTP_NO_CONTENT = 204

export interface ApiClientOptions {
  /** Base URL ending in /api/v1 (decision D-10). */
  baseURL: string | undefined
  isMockMode?: boolean
  timeoutMs?: number
  adapter?: AxiosAdapter
  getAccessToken?: () => string | null | undefined
  /** Called once per 401 response, before the ApiError is thrown. */
  onUnauthorized?: (error: ApiError) => void
}

export type RequestConfig = Omit<AxiosRequestConfig, 'url' | 'method' | 'data'> & {
  /** Skip onUnauthorized for an expected 401, e.g. a wrong password on sign-in. */
  skipUnauthorizedHandler?: boolean
}

const ABSOLUTE_URL = /^([a-z][a-z\d+\-.]*:)?\/\//i

export interface ApiClient {
  readonly axios: AxiosInstance
  get<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>>
  delete<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>>
  post<T>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
  put<T>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
  patch<T>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
}

const metadataSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
  limit: z.number(),
})

const successSchema = z.object({
  message: z.string().optional(),
  data: z.unknown(),
  metadata: metadataSchema.optional(),
})

function isAbsoluteUrl(url: string | undefined): boolean {
  return url !== undefined && ABSOLUTE_URL.test(url)
}

function isEmptyBody(body: unknown): boolean {
  return body === undefined || body === null || body === ''
}

function unwrapEnvelope<T>(response: AxiosResponse): ApiResponse<T> {
  if (response.status === HTTP_NO_CONTENT || isEmptyBody(response.data)) {
    return { data: undefined as T }
  }

  const body: unknown = response.data
  const parsed =
    // NestJS sends { message } without data for a result with no payload.
    body !== null && typeof body === 'object' && ('data' in body || 'message' in body)
      ? successSchema.safeParse(body)
      : undefined
  if (!parsed?.success) {
    throw new ApiError({
      kind: 'invalid_response',
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The server sent an unexpected response',
    })
  }

  const { message, data, metadata } = parsed.data
  return {
    ...(message !== undefined && { message }),
    data: data as T,
    ...(metadata !== undefined && { metadata }),
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const isMockMode = options.isMockMode ?? process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
  const baseURL = isMockMode ? MOCK_BASE_URL : options.baseURL

  const instance = axios.create({
    baseURL,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    ...(options.adapter && { adapter: options.adapter }),
  })

  instance.interceptors.request.use((config) => {
    // The token only goes to this client's own base URL, never to absolute URLs.
    if (isMockMode || isAbsoluteUrl(config.url)) return config
    const token = options.getAccessToken?.()
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  function notifyUnauthorized(error: ApiError) {
    try {
      options.onUnauthorized?.(error)
    } catch {
      // A failing hook must not replace the ApiError the caller is waiting for.
    }
  }

  async function request<T>({
    skipUnauthorizedHandler,
    ...config
  }: AxiosRequestConfig & RequestConfig): Promise<ApiResponse<T>> {
    if (!baseURL) {
      throw new ApiError({
        kind: 'config',
        status: 0,
        code: 'API_BASE_URL_MISSING',
        message: 'API base URL is not configured',
      })
    }
    try {
      return unwrapEnvelope<T>(await instance.request(config))
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.isUnauthorized && !skipUnauthorizedHandler) notifyUnauthorized(apiError)
      throw apiError
    }
  }

  return {
    axios: instance,
    get: (url, config) => request({ ...config, url, method: 'GET' }),
    delete: (url, config) => request({ ...config, url, method: 'DELETE' }),
    post: (url, body, config) => request({ ...config, url, method: 'POST', data: body }),
    put: (url, body, config) => request({ ...config, url, method: 'PUT', data: body }),
    patch: (url, body, config) => request({ ...config, url, method: 'PATCH', data: body }),
  }
}
