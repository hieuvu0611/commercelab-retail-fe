import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { MAX_ADDRESSES, type Address, type AddressInput } from '@/types/checkout'

/** Address book of the in-app mock backend (/mock-api). Mirrors the P4-T02 contract (see src/types/checkout.ts). */

export interface MockAddressState {
  /** Newest last, per user id. */
  books: Map<string, Address[]>
  counter: number
}

export const createMockAddressState = (): MockAddressState => ({ books: new Map(), counter: 0 })

const globalForAddresses = globalThis as unknown as { __mockAddressState?: MockAddressState }

export function getMockAddressState(): MockAddressState {
  globalForAddresses.__mockAddressState ??= createMockAddressState()
  return globalForAddresses.__mockAddressState
}

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

const failure = (
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string[]>
): MockResponse => ({
  status,
  body: { message, code, status, ...(errors && { errors }) },
})

const FIELD_LIMITS: Array<[field: keyof AddressInput & string, label: string, max: number]> = [
  ['recipient', 'Recipient', 100],
  ['line1', 'Street address', 200],
  ['ward', 'Ward', 100],
  ['district', 'District', 100],
  ['province', 'Province', 100],
]
const PHONE_SEPARATORS = /[\s().-]/g
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/

/** Validates and normalises a body; returns the field errors when invalid. */
function parseInput(body: Record<string, unknown>): AddressInput | Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const text = (field: string) =>
    typeof body[field] === 'string' ? (body[field] as string).trim() : ''
  for (const [field, label, max] of FIELD_LIMITS) {
    if (!text(field)) errors[field] = [`${label} is required`]
    else if (text(field).length > max)
      errors[field] = [`${label} must be at most ${max} characters`]
  }
  const phone = text('phone').replace(PHONE_SEPARATORS, '')
  if (!PHONE_PATTERN.test(phone))
    errors.phone = ['Phone must be an international number of 7 to 15 digits']
  if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean')
    errors.isDefault = ['isDefault must be true or false']
  if (Object.keys(errors).length > 0) return errors
  return {
    recipient: text('recipient'),
    phone,
    line1: text('line1'),
    ward: text('ward'),
    district: text('district'),
    province: text('province'),
    isDefault: body.isDefault === true,
  }
}

const isInput = (value: AddressInput | Record<string, string[]>): value is AddressInput =>
  typeof (value as AddressInput).recipient === 'string'

/** Looks an address up for the quote mock. */
export const findAddress = (
  state: MockAddressState,
  userId: string,
  id: string
): Address | undefined => state.books.get(userId)?.find((address) => address.id === id)

/** Returns a response for an address endpoint, or null when the request is not an address request. */
export function handleAddressMock(
  request: MockRequest,
  userId: string | null,
  state: MockAddressState = getMockAddressState()
): MockResponse | null {
  const { method, path } = request
  const match = path.match(/^\/users\/me\/addresses(?:\/([^/]+))?$/)
  if (!match) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  const id = match[1]
  const book = state.books.get(userId) ?? []
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  const save = (next: Address[]) => state.books.set(userId, next)
  const withDefault = (list: Address[], defaultId: string): Address[] =>
    list.map((address) => ({ ...address, isDefault: address.id === defaultId }))

  if (!id) {
    if (method === 'GET') return ok(book)
    if (method === 'POST') {
      const input = parseInput(body)
      if (!isInput(input))
        return failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', input)
      if (book.length >= MAX_ADDRESSES)
        return failure(
          409,
          'ADDRESS_LIMIT_REACHED',
          `You can save up to ${MAX_ADDRESSES} addresses`
        )
      state.counter += 1
      const created: Address = {
        ...input,
        id: `addr-${state.counter}`,
        // The first address becomes the default.
        isDefault: input.isDefault || book.length === 0,
      }
      save(created.isDefault ? [...withDefault(book, ''), created] : [...book, created])
      return ok(created, 'Address created', 201)
    }
  } else {
    const current = book.find((address) => address.id === id)
    if (!current) return failure(404, 'ADDRESS_NOT_FOUND', 'Address not found')
    if (method === 'GET') return ok(current)
    if (method === 'PUT') {
      const input = parseInput(body)
      if (!isInput(input))
        return failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', input)
      // The default cannot be unset directly: another address has to be made the default.
      const updated: Address = { ...input, id, isDefault: input.isDefault || current.isDefault }
      const replaced = book.map((address) => (address.id === id ? updated : address))
      save(updated.isDefault ? withDefault(replaced, id) : replaced)
      return ok(updated, 'Address updated')
    }
    if (method === 'DELETE') {
      const rest = book.filter((address) => address.id !== id)
      // Deleting the default promotes the newest remaining address.
      save(
        current.isDefault && rest.length > 0 ? withDefault(rest, rest[rest.length - 1].id) : rest
      )
      return ok({}, 'Address deleted')
    }
  }
  return failure(404, 'NOT_FOUND', 'This mock endpoint does not exist')
}
