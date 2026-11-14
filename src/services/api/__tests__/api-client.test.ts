import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ApiError } from '../api-error'
import { createApiClient, type ApiClientOptions } from '../api-client'

type Reply = {
  status: number
  data?: unknown
  headers?: Record<string, string>
}

// Mimics axios' own settle(): 2xx resolves, anything else rejects with an AxiosError.
function replyWith(reply: Reply, seen: InternalAxiosRequestConfig[] = []): AxiosAdapter {
  return async (config) => {
    seen.push(config)
    const response: AxiosResponse = {
      status: reply.status,
      statusText: String(reply.status),
      data: reply.data,
      headers: new AxiosHeaders(reply.headers ?? {}),
      config,
    }
    if (reply.status >= 200 && reply.status < 300) return response
    throw new AxiosError(
      `Request failed with status code ${reply.status}`,
      reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response
    )
  }
}

function failWith(code: string): AxiosAdapter {
  return async (config) => {
    throw new AxiosError(`failed: ${code}`, code, config, {})
  }
}

function client(adapter: AxiosAdapter, options: Partial<ApiClientOptions> = {}) {
  return createApiClient({
    baseURL: 'http://gateway.test/api/v1',
    isMockMode: false,
    adapter,
    ...options,
  })
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('createApiClient success envelope', () => {
  it('unwraps data, message and pagination metadata', async () => {
    const api = client(
      replyWith({
        status: 200,
        data: {
          message: 'Products retrieved',
          data: [{ id: 'p-1' }],
          metadata: { total: 1, page: 1, pageCount: 1, limit: 20 },
        },
      })
    )

    const result = await api.get<{ id: string }[]>('/products')

    expect(result).toEqual({
      message: 'Products retrieved',
      data: [{ id: 'p-1' }],
      metadata: { total: 1, page: 1, pageCount: 1, limit: 20 },
    })
  })

  it('treats 204 No Content as success without data', async () => {
    const api = client(replyWith({ status: 204, data: '' }))

    await expect(api.delete('/carts/me/items/sku-1')).resolves.toEqual({ data: undefined })
  })

  it('accepts a NestJS success body that has a message but no data', async () => {
    const api = client(replyWith({ status: 200, data: { message: 'Done' } }))

    await expect(api.post('/backoffice/returns', {})).resolves.toEqual({
      message: 'Done',
      data: undefined,
    })
  })

  it('rejects a 2xx body that is not an envelope', async () => {
    const api = client(replyWith({ status: 200, data: '<html>proxy page</html>' }))

    const error = await captureError(api.get('/products'))

    expect(error.kind).toBe('invalid_response')
    expect(error.code).toBe('INVALID_RESPONSE')
    expect(error.status).toBe(200)
  })
})

describe('createApiClient error parsing', () => {
  it('parses the project error envelope with field errors', async () => {
    const api = client(
      replyWith({
        status: 422,
        data: {
          message: 'Validation failed',
          code: 'VALIDATION_FAILED',
          status: 422,
          correlationId: 'corr-123',
          errors: { email: ['Email is required'] },
        },
      })
    )

    const error = await captureError(api.post('/auth/register', {}))

    expect(error).toMatchObject({
      kind: 'http',
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      correlationId: 'corr-123',
      fieldErrors: { email: ['Email is required'] },
    })
  })

  it('keeps the code and valid field errors when optional fields are malformed', async () => {
    const api = client(
      replyWith({
        status: 422,
        data: {
          message: 'Validation failed',
          code: 'VALIDATION_FAILED',
          correlationId: ['corr-1', 'corr-2'],
          errors: { email: ['Email is required'], address: { city: ['Required'] } },
        },
      })
    )

    const error = await captureError(api.post('/auth/register', {}))

    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      fieldErrors: { email: ['Email is required'] },
    })
    expect(error.correlationId).toBeUndefined()
  })

  it('parses an RFC 9457 problem details body', async () => {
    const api = client(
      replyWith({
        status: 409,
        headers: {
          'content-type': 'application/problem+json',
          'x-correlation-id': 'corr-from-header',
        },
        data: {
          type: 'https://commercelab.example/problems/out-of-stock',
          title: 'Out of stock',
          status: 409,
          detail: 'Only 2 units of SKU BP-20L-BLK are available.',
          code: 'INSUFFICIENT_STOCK',
          'invalid-params': [{ name: 'quantity', reason: 'Must be 2 or less' }],
        },
      })
    )

    const error = await captureError(api.post('/carts/me/items', {}))

    expect(error).toMatchObject({
      kind: 'http',
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Only 2 units of SKU BP-20L-BLK are available.',
      correlationId: 'corr-from-header',
      fieldErrors: { quantity: ['Must be 2 or less'] },
    })
  })

  it('falls back to an HTTP code when the error body is not JSON', async () => {
    const api = client(replyWith({ status: 502, data: '<html>Bad gateway</html>' }))

    const error = await captureError(api.get('/products'))

    expect(error).toMatchObject({ kind: 'http', status: 502, code: 'HTTP_502' })
    expect(error.fieldErrors).toEqual({})
  })

  it('reports a network failure', async () => {
    const api = client(failWith(AxiosError.ERR_NETWORK))

    const error = await captureError(api.get('/products'))

    expect(error).toMatchObject({ kind: 'network', status: 0, code: 'NETWORK_ERROR' })
  })

  it('reports a timeout', async () => {
    const api = client(failWith(AxiosError.ECONNABORTED))

    const error = await captureError(api.get('/products'))

    expect(error).toMatchObject({ kind: 'timeout', status: 0, code: 'TIMEOUT' })
  })

  it('reports a cancelled request separately from a network failure', async () => {
    const api = client(failWith(AxiosError.ERR_CANCELED))

    const error = await captureError(api.get('/products'))

    expect(error).toMatchObject({ kind: 'canceled', code: 'REQUEST_CANCELED' })
  })
})

describe('createApiClient 401 path', () => {
  it('calls onUnauthorized once with the ApiError and rethrows it', async () => {
    const onUnauthorized = jest.fn()
    const api = client(
      replyWith({
        status: 401,
        data: { message: 'Token expired', code: 'TOKEN_EXPIRED', status: 401 },
      }),
      { onUnauthorized }
    )

    const error = await captureError(api.get('/orders'))

    expect(error.isUnauthorized).toBe(true)
    expect(error.code).toBe('TOKEN_EXPIRED')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledWith(error)
  })

  it('lets a request opt out of the 401 hook, e.g. a wrong-password login', async () => {
    const onUnauthorized = jest.fn()
    const api = client(
      replyWith({ status: 401, data: { message: 'Bad credentials', code: 'INVALID_CREDENTIALS' } }),
      { onUnauthorized }
    )

    const error = await captureError(api.post('/auth/login', {}, { skipUnauthorizedHandler: true }))

    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('still throws the ApiError when the 401 hook itself throws', async () => {
    const api = client(
      replyWith({ status: 401, data: { message: 'Token expired', code: 'TOKEN_EXPIRED' } }),
      {
        onUnauthorized: () => {
          throw new Error('hook failed')
        },
      }
    )

    const error = await captureError(api.get('/orders'))

    expect(error.code).toBe('TOKEN_EXPIRED')
  })

  it('does not call onUnauthorized for other errors', async () => {
    const onUnauthorized = jest.fn()
    const api = client(replyWith({ status: 403, data: { message: 'No', code: 'FORBIDDEN' } }), {
      onUnauthorized,
    })

    await captureError(api.get('/orders'))

    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('createApiClient configuration', () => {
  it('sends the bearer token from the access token provider', async () => {
    const seen: InternalAxiosRequestConfig[] = []
    const api = client(replyWith({ status: 200, data: { data: null } }, seen), {
      getAccessToken: () => 'token-abc',
    })

    await api.get('/auth/me')

    expect(seen[0].headers.get('Authorization')).toBe('Bearer token-abc')
    expect(seen[0].baseURL).toBe('http://gateway.test/api/v1')
  })

  it('never sends the bearer token to an absolute URL', async () => {
    const seen: InternalAxiosRequestConfig[] = []
    const api = client(replyWith({ status: 200, data: { data: null } }, seen), {
      getAccessToken: () => 'token-abc',
    })

    await api.put('https://bucket.example.com/upload?signature=x', {})

    expect(seen[0].headers.get('Authorization')).toBeUndefined()
  })

  it('uses the mock base URL and no auth header in mock mode', async () => {
    const seen: InternalAxiosRequestConfig[] = []
    const api = client(replyWith({ status: 200, data: { data: null } }, seen), {
      isMockMode: true,
      getAccessToken: () => 'token-abc',
    })

    await api.get('/auth/me')

    expect(seen[0].baseURL).toBe('/mock-api')
    expect(seen[0].headers.get('Authorization')).toBeUndefined()
  })

  it('fails on the first request when the base URL is missing', async () => {
    const api = client(replyWith({ status: 200, data: { data: null } }), { baseURL: undefined })

    const error = await captureError(api.get('/products'))

    expect(error).toMatchObject({ kind: 'config', code: 'API_BASE_URL_MISSING' })
  })
})
