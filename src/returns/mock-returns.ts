import type { MockRequest, MockResponse } from '@/auth/mock-api'
import {
  getMockFulfillmentState,
  isoTime,
  mockWarehouseOf,
  type MockFulfillmentState,
} from '@/fulfillment/mock-fulfillment'
import { getMockOrderState, type MockOrder, type MockOrderState } from '@/orders/mock-orders'
import { RETURN_REASONS } from '@/types/returns'
import {
  getMockReturnsState,
  heldQuantity,
  type MockReturn,
  type MockReturnsState,
} from './mock-returns-state'

/**
 * Customer return endpoints of the in-app mock backend (/mock-api): ask to return delivered units within the seven-day
 * window and read the cases. Wire shapes are a provisional reading of P8-T02 (see src/types/returns.ts).
 */

const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export interface ReturnsMockDeps {
  orders: MockOrderState
  fulfillment: MockFulfillmentState
  returns: MockReturnsState
  now: () => number
}

const defaultDeps = (): ReturnsMockDeps => ({
  orders: getMockOrderState(),
  fulfillment: getMockFulfillmentState(),
  returns: getMockReturnsState(),
  now: Date.now,
})

export const failure = (
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

export const refundView = (item: MockReturn) =>
  item.refund && {
    amountVnd: item.refund.amountVnd,
    goodsVnd: item.refund.goodsVnd,
    shippingVnd: item.refund.shippingVnd,
    status: item.refund.status,
  }

/** A case as the customer's endpoints send it: no staff names, no ceiling, no history. */
export const customerView = (item: MockReturn) => ({
  returnId: item.returnId,
  orderId: item.orderId,
  status: item.status,
  reason: item.reason,
  items: item.lines.map((line) => ({
    skuId: line.skuId,
    skuName: line.skuName,
    quantity: line.quantity,
    receivedQuantity: line.receivedQuantity,
    qcPassedQuantity: line.qcPassed,
    qcFailedQuantity: line.qcFailed,
    allocatedUnitPaidVnd: line.allocatedUnitPaidVnd,
  })),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  ...(item.refund && { refund: refundView(item) }),
  ...(item.rejectionNote && { rejectionNote: item.rejectionNote }),
})

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data },
})

function create(
  request: MockRequest,
  order: MockOrder,
  userId: string,
  deps: ReturnsMockDeps
): MockResponse {
  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  const key = request.idempotencyKey ?? ''
  if (!KEY_PATTERN.test(key))
    return invalid('Idempotency-Key', 'Send an Idempotency-Key of 1 to 128 safe characters')

  const replayedId = deps.returns.keys.get(`${userId}|${key}`)
  if (replayedId) return ok(customerView(deps.returns.returns.get(replayedId)!), 'Return already requested')

  const reason = RETURN_REASONS.find((entry) => entry.code === body.reason)?.code
  if (!reason)
    return invalid('reason', `reason must be one of ${RETURN_REASONS.map((r) => r.code).join(', ')}`)
  const asked = Array.isArray(body.lines) ? (body.lines as Array<Record<string, unknown>>) : []
  const wanted = asked.filter((line) => Number(line.quantity) > 0)
  if (wanted.length === 0 || wanted.some((line) => !Number.isInteger(line.quantity)))
    return invalid('lines', 'Choose at least one item and a whole number of units to return')

  const shipment = deps.fulfillment.shipments.get(order.orderId)
  if (order.status !== 'DELIVERED' || !shipment || shipment.status !== 'DELIVERED')
    return failure(409, 'ORDER_NOT_DELIVERED', 'Only a delivered order can be returned')
  if (!shipment.returnWindowEndsAt || deps.now() > Date.parse(shipment.returnWindowEndsAt))
    return failure(409, 'RETURN_WINDOW_CLOSED', 'The 7-day return window has closed')

  const lines = []
  for (const line of wanted) {
    const skuId = String(line.skuId)
    const picked = shipment.lines.find((entry) => entry.skuId === skuId)
    const snapshot = order.snapshot.lines.find((entry) => entry.skuId === skuId)
    if (!picked || !snapshot)
      return failure(422, 'SKU_NOT_IN_ORDER', `${skuId} is not part of this order`)
    const remaining = picked.pickedQuantity - heldQuantity(deps.returns, order.orderId, skuId)
    if (Number(line.quantity) > remaining)
      return failure(
        409,
        'RETURN_QUANTITY_EXCEEDED',
        `Only ${remaining} unit(s) of ${skuId} can still be returned`
      )
    lines.push({
      skuId,
      skuName: picked.skuName,
      quantity: Number(line.quantity),
      receivedQuantity: 0,
      qcPassed: 0,
      qcFailed: 0,
      allocatedUnitPaidVnd: Number(snapshot.allocatedUnitPaidVnd ?? 0),
    })
  }

  deps.returns.counter += 1
  const returnId = `RMA-${String(deps.returns.counter).padStart(3, '0')}`
  const at = isoTime(deps.now())
  const item: MockReturn = {
    returnId,
    orderId: order.orderId,
    userId,
    warehouseId: mockWarehouseOf(order.orderId),
    reason,
    status: 'REQUESTED',
    lines,
    createdAt: at,
    updatedAt: at,
    rejectionNote: '',
    refund: null,
    history: [{ at, type: 'REQUESTED', actor: 'customer' }],
  }
  deps.returns.returns.set(returnId, item)
  deps.returns.keys.set(`${userId}|${key}`, returnId)
  return ok(customerView(item), 'Return requested', 201)
}

/** Returns a response for a customer return endpoint, or null for any other request. */
export function handleReturnsMock(
  request: MockRequest,
  userId: string | null,
  deps: ReturnsMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const isCreate = method === 'POST' && path === '/returns'
  const isList = method === 'GET' && path === '/returns'
  const read = method === 'GET' ? path.match(/^\/returns\/([^/]+)$/) : null
  if (!isCreate && !isList && !read) return null
  if (!userId) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')

  if (read) {
    const item = deps.returns.returns.get(decodeURIComponent(read[1]))
    if (!item || item.userId !== userId) return failure(404, 'RETURN_NOT_FOUND', 'Return not found')
    return ok(customerView(item), 'Return retrieved')
  }

  if (isList) {
    const orderId = request.query?.orderId ?? ''
    const mine = [...deps.returns.returns.values()]
      .filter((item) => item.userId === userId && (!orderId || item.orderId === orderId))
      .reverse()
    return ok(mine.map(customerView), 'Returns retrieved')
  }

  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  const order = deps.orders.orders.get(String(body.orderId ?? ''))
  if (!order || order.userId !== userId) return failure(404, 'ORDER_NOT_FOUND', 'Order not found')
  return create(request, order, userId, deps)
}
