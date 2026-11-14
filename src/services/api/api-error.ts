import axios from 'axios'
import { z } from 'zod'

export type ApiErrorKind =
  | 'http'
  | 'network'
  | 'timeout'
  | 'canceled'
  | 'invalid_response'
  | 'config'
  | 'unknown'

export type FieldErrors = Readonly<Record<string, string[]>>

interface ApiErrorInit {
  kind: ApiErrorKind
  status: number
  code: string
  message: string
  correlationId?: string
  fieldErrors?: FieldErrors
  cause?: unknown
}

// One error type for every failed API call. Use `code`, not `message`, for behaviour.
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  readonly code: string
  readonly correlationId?: string
  readonly fieldErrors: FieldErrors

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.correlationId = init.correlationId
    this.fieldErrors = init.fieldErrors ?? {}
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

const fieldErrorsSchema = z.record(z.string(), z.array(z.string()))

// docs/08: { message, code, status, correlationId?, errors? }
const projectErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
  correlationId: z.string().optional(),
  errors: fieldErrorsSchema.optional(),
})

// RFC 9457 problem details, with the project's extension members.
const problemSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    detail: z.string().optional(),
    code: z.string().optional(),
    correlationId: z.string().optional(),
    errors: fieldErrorsSchema.optional(),
    'invalid-params': z.array(z.object({ name: z.string(), reason: z.string() })).optional(),
  })
  .refine((body) => body.type ?? body.title ?? body.detail, 'not a problem details body')

const TIMEOUT_CODES = new Set<string>([axios.AxiosError.ECONNABORTED, axios.AxiosError.ETIMEDOUT])

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const value =
    'get' in headers && typeof headers.get === 'function'
      ? headers.get(name)
      : (headers as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mergeInvalidParams(
  errors: FieldErrors | undefined,
  invalidParams: { name: string; reason: string }[] | undefined
): FieldErrors {
  const merged: Record<string, string[]> = { ...errors }
  for (const param of invalidParams ?? []) {
    merged[param.name] = [...(merged[param.name] ?? []), param.reason]
  }
  return merged
}

export function errorFromResponse(status: number, body: unknown, headers: unknown): ApiError {
  const headerCorrelationId = readHeader(headers, 'x-correlation-id')

  const project = projectErrorSchema.safeParse(body)
  if (project.success) {
    return new ApiError({
      kind: 'http',
      status,
      code: project.data.code,
      message: project.data.message,
      correlationId: project.data.correlationId ?? headerCorrelationId,
      fieldErrors: project.data.errors,
    })
  }

  const problem = problemSchema.safeParse(body)
  if (problem.success) {
    const { code, detail, title, correlationId, errors } = problem.data
    return new ApiError({
      kind: 'http',
      status,
      code: code ?? `HTTP_${status}`,
      message: detail ?? title ?? `Request failed with status ${status}`,
      correlationId: correlationId ?? headerCorrelationId,
      fieldErrors: mergeInvalidParams(errors, problem.data['invalid-params']),
    })
  }

  return new ApiError({
    kind: 'http',
    status,
    code: `HTTP_${status}`,
    message: `Request failed with status ${status}`,
    correlationId: headerCorrelationId,
  })
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (!axios.isAxiosError(error)) {
    return new ApiError({
      kind: 'unknown',
      status: 0,
      code: 'UNKNOWN_ERROR',
      message: 'Unexpected error',
      cause: error,
    })
  }

  if (error.code === axios.AxiosError.ERR_CANCELED) {
    return new ApiError({
      kind: 'canceled',
      status: 0,
      code: 'REQUEST_CANCELED',
      message: 'Request was cancelled',
      cause: error,
    })
  }

  if (error.response) {
    return errorFromResponse(error.response.status, error.response.data, error.response.headers)
  }

  if (error.code && TIMEOUT_CODES.has(error.code)) {
    return new ApiError({
      kind: 'timeout',
      status: 0,
      code: 'TIMEOUT',
      message: 'The server took too long to respond',
      cause: error,
    })
  }

  return new ApiError({
    kind: 'network',
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Cannot connect to the server',
    cause: error,
  })
}
