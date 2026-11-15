import type { MockRequest, MockResponse } from '@/auth/mock-api'
import { ORDER_STATUSES } from '@/types/order'
import {
  allOrdersNewestFirst,
  getMockOrderState,
  orderDetailView,
  settleOrder,
  type MockOrder,
  type OrderMockDeps,
} from './mock-orders'
import { getMockCartState } from '@/cart/mock-cart'
import { getMockAddressState } from '@/addresses/mock-addresses'
import { getMockQuoteState } from '@/checkout/mock-checkout'
import { getMockState } from '@/auth/mock-iam'
import { ORDER_VIEW_ROLES } from './staff-roles'

/** Backoffice order list and detail of the in-app mock backend (/mock-api). Mirrors the real GET /admin/orders contract (P5-T14): masked recipient and phone flat on the order. */

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 100
const ROLES: readonly string[] = ORDER_VIEW_ROLES

const defaultDeps = (): OrderMockDeps => ({
  orders: getMockOrderState(),
  quotes: getMockQuoteState(),
  carts: getMockCartState(),
  addresses: getMockAddressState(),
  customerName: (userId) => getMockState().users.get(userId)?.name ?? 'Customer',
  now: Date.now,
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

const invalid = (field: string, message: string) =>
  failure(400, 'VALIDATION_FAILED', 'The request has invalid fields', { [field]: [message] })

/** "Lan Nguyen" -> "Lan N." */
export function maskName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest[rest.length - 1]
  return last ? `${first} ${last[0]}.` : first
}

/** Keeps the country code and the last three digits: "+84901234567" -> "+84*******567". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.length <= 6) return '*'.repeat(digits.length)
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 6)}${digits.slice(-3)}`
}

/** Recipient and phone masked, district and province kept: the real services never send staff the street address. */
function staffContact(order: MockOrder) {
  const address = order.snapshot.address as Record<string, string> | null
  if (!address) return {}
  return {
    recipient: maskName(address.recipient),
    phone: maskPhone(address.phone),
    district: address.district,
    province: address.province,
  }
}

const staffRow = (order: MockOrder) => ({
  orderId: order.orderId,
  customerId: order.userId,
  status: order.status,
  paymentStatus: order.paymentStatus,
  ...(order.failureCode && { failureCode: order.failureCode }),
  warehouseId: 'WH-HCM-01',
  totalPayableVnd: order.totalPayableVnd,
  itemCount: order.snapshot.lines.reduce((sum, line) => sum + Number(line.quantity), 0),
  createdAt: order.createdAt,
  updatedAt: order.createdAt,
  ...staffContact(order),
})

function staffDetail(order: MockOrder) {
  const { shippingAddress: _shippingAddress, ...rest } = orderDetailView(order) as ReturnType<
    typeof orderDetailView
  >
  return {
    ...rest,
    ...staffRow(order),
    items: order.snapshot.lines,
    payment: rest.payment,
    refundObligation: rest.refundObligation,
  }
}

/** Returns a response for a backoffice order endpoint, or null for any other request. */
export function handleStaffOrderMock(
  request: MockRequest,
  caller: { name: string; roles: string[] } | null,
  deps: OrderMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const match = method === 'GET' ? path.match(/^\/admin\/orders(?:\/([^/]+))?$/) : null
  if (!match) return null
  if (!caller) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!caller.roles.some((role) => ROLES.includes(role)))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

  const orders = allOrdersNewestFirst(deps.orders)
  orders.forEach((order) => settleOrder(order, deps.now()))

  if (match[1]) {
    const order = orders.find((entry) => entry.orderId === decodeURIComponent(match[1]))
    if (!order) return failure(404, 'ORDER_NOT_FOUND', 'Order not found')
    return { status: 200, body: { message: 'Order retrieved', data: staffDetail(order) } }
  }

  const status = request.query?.status ?? ''
  const limit = Number(request.query?.limit ?? DEFAULT_LIMIT)
  const page = Number(request.query?.page ?? 1)
  if (status && !(ORDER_STATUSES as readonly string[]).includes(status))
    return invalid('status', 'Unknown status')
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    return invalid('limit', `limit must be between 1 and ${MAX_LIMIT}`)
  if (!Number.isInteger(page) || page < 1) return invalid('page', 'page must be 1 or more')

  const matching = orders.filter((order) => !status || order.status === status)
  const rows = matching.slice((page - 1) * limit, page * limit).map(staffRow)
  return {
    status: 200,
    body: {
      message: 'Orders retrieved',
      data: rows,
      metadata: {
        total: matching.length,
        page,
        pageCount: Math.max(1, Math.ceil(matching.length / limit)),
        limit,
      },
    },
  }
}
