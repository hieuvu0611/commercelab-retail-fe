import type { MockRequest, MockResponse } from '@/auth/mock-api'
import {
  RETURN_WINDOW_DAYS,
  getMockFulfillmentState,
  recordChange,
  syncShipments,
  type FulfillmentMockDeps,
  type MockShipment,
} from './mock-fulfillment'
import { getMockOrderState } from '@/orders/mock-orders'
import {
  confirmStopShipment,
  getMockCancellationState,
  resolveStopByHandover,
  type MockCancellationState,
} from '@/orders/mock-cancellation'
import { SHIPMENT_ROLES } from './shipment-state'

/** Warehouse (backoffice) shipment endpoints of the in-app mock backend (/mock-api): queue, pick list, scan, pack, handover and shortage. Wire shapes follow the real service (see src/types/fulfillment.ts). */

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 100
const ALL_WAREHOUSES = 'ALL'
const ROLES: readonly string[] = SHIPMENT_ROLES
const MAX_REASON = 500

export interface ShipmentCaller {
  name: string
  roles: string[]
  warehouseScopes: string[]
}

/** The cancellation state is optional so the shipment tests need not build it; the app uses the shared one. */
export type ShipmentMockDeps = FulfillmentMockDeps & { cancellations?: MockCancellationState }

const defaultDeps = (): ShipmentMockDeps => ({
  orders: getMockOrderState(),
  fulfillment: getMockFulfillmentState(),
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

const DAY_MS = 24 * 60 * 60 * 1000

/** One shipment as the service sends it, in the queue and as the answer of every action. */
const row = (shipment: MockShipment) => ({
  shipmentId: shipment.shipmentId,
  orderId: shipment.orderId,
  warehouseId: shipment.warehouseId,
  status: shipment.status,
  version: shipment.version,
  paymentMethod: shipment.paymentMethod ?? 'PREPAID',
  codAmountToCollect: shipment.codAmountToCollect ?? 0,
  items: shipment.lines.map((line) => ({
    skuId: line.skuId,
    quantity: line.orderedQuantity,
    pickedQuantity: line.pickedQuantity,
    deliveredQuantity: shipment.status === 'DELIVERED' ? line.pickedQuantity : 0,
  })),
  ...(shipment.handedOverAt && { handedOverAt: shipment.handedOverAt }),
  ...(shipment.returnWindowEndsAt && {
    deliveredAt: new Date(
      Date.parse(shipment.returnWindowEndsAt) - RETURN_WINDOW_DAYS * DAY_MS
    ).toISOString(),
    returnWindowEndsAt: shipment.returnWindowEndsAt,
  }),
  ...(shipment.shortage && { failureReason: shipment.shortage.reason }),
  createdAt: shipment.createdAt,
})

const detail = row

const inScope = (caller: ShipmentCaller, warehouseId: string) =>
  caller.warehouseScopes.includes(ALL_WAREHOUSES) || caller.warehouseScopes.includes(warehouseId)

const isOpenForPicking = (shipment: MockShipment) =>
  shipment.status === 'PENDING_PICK' || shipment.status === 'PICKING'

const ACTION = /^\/admin\/shipments\/([^/]+)\/(scan|pack|handover|report-shortage|confirm-stop)$/
const ITEM = /^\/admin\/shipments\/([^/]+)$/

/** Returns a response for a backoffice shipment endpoint, or null for any other request. */
export function handleShipmentAdminMock(
  request: MockRequest,
  caller: ShipmentCaller | null,
  deps: ShipmentMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request
  const isList = method === 'GET' && path === '/admin/shipments'
  const item = method === 'GET' ? path.match(ITEM) : null
  const action = method === 'POST' ? path.match(ACTION) : null
  if (!isList && !item && !action) return null
  if (!caller) return failure(401, 'UNAUTHORIZED', 'A valid access token is required')
  if (!caller.roles.some((role) => ROLES.includes(role)))
    return failure(403, 'FORBIDDEN', 'You do not have permission to perform this action')

  syncShipments(deps)
  const all = [...deps.fulfillment.shipments.values()].reverse()

  if (isList) {
    const status = request.query?.status ?? ''
    const limit = Number(request.query?.limit ?? DEFAULT_LIMIT)
    const page = Number(request.query?.page ?? 1)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      return invalid('limit', `limit must be between 1 and ${MAX_LIMIT}`)
    if (!Number.isInteger(page) || page < 1) return invalid('page', 'page must be 1 or more')
    const matching = all.filter(
      (shipment) => inScope(caller, shipment.warehouseId) && (!status || shipment.status === status)
    )
    return {
      status: 200,
      body: {
        message: 'Shipments retrieved',
        data: matching.slice((page - 1) * limit, page * limit).map(row),
        metadata: {
          total: matching.length,
          page,
          pageCount: Math.max(1, Math.ceil(matching.length / limit)),
          limit,
        },
      },
    }
  }

  const id = decodeURIComponent((item ?? action)![1])
  const shipment = all.find((entry) => entry.shipmentId === id)
  if (!shipment) return failure(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found')
  if (!inScope(caller, shipment.warehouseId))
    return failure(
      403,
      'FORBIDDEN_WAREHOUSE_SCOPE',
      'This shipment belongs to a warehouse outside your scope'
    )
  if (item) return { status: 200, body: { message: 'Shipment retrieved', data: detail(shipment) } }

  const body =
    request.body !== null && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {}
  if (body.version !== undefined && body.version !== shipment.version)
    return failure(409, 'STALE_VERSION', 'The shipment changed since you opened it')
  const now = deps.now()
  const done = (message: string): MockResponse => ({
    status: 200,
    body: { message, data: detail(shipment) },
  })

  const cancelDeps = { ...deps, cancellations: deps.cancellations ?? getMockCancellationState() }

  switch (action![2]) {
    case 'confirm-stop':
      return confirmStopShipment(shipment, cancelDeps) ?? done('Shipment stopped')
    case 'scan': {
      const skuId = typeof body.skuId === 'string' ? body.skuId.trim() : ''
      const quantity = body.quantity
      if (!skuId) return invalid('skuId', 'skuId is required')
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1)
        return invalid('quantity', 'quantity must be a whole number of 1 or more')
      if (!isOpenForPicking(shipment))
        return failure(
          409,
          'SHIPMENT_NOT_PICKABLE',
          `A shipment that is ${shipment.status} cannot be picked`
        )
      const line = shipment.lines.find((entry) => entry.skuId === skuId)
      if (!line) return failure(422, 'SKU_NOT_ON_PICK_LIST', `${skuId} is not on this pick list`)
      if (line.pickedQuantity + quantity > line.orderedQuantity)
        return failure(
          422,
          'QUANTITY_EXCEEDS_ORDER',
          `${skuId}: ${line.orderedQuantity} ordered, ${line.pickedQuantity} already picked`
        )
      line.pickedQuantity += quantity
      const first = shipment.status === 'PENDING_PICK'
      recordChange(
        shipment,
        'PICKING',
        first ? { label: 'We are picking your items', status: 'PICKING' } : null,
        now
      )
      return done('Scan recorded')
    }
    case 'pack': {
      if (!isOpenForPicking(shipment))
        return failure(
          409,
          'SHIPMENT_NOT_PICKABLE',
          `A shipment that is ${shipment.status} cannot be packed`
        )
      if (shipment.lines.some((line) => line.pickedQuantity < line.orderedQuantity))
        return failure(409, 'PICK_INCOMPLETE', 'Every line must be fully picked before packing')
      recordChange(shipment, 'PACKED', { label: 'Your order is packed', status: 'PACKED' }, now)
      return done('Shipment packed')
    }
    case 'handover': {
      if (shipment.status !== 'PACKED')
        return failure(
          409,
          'HANDOVER_NOT_ALLOWED',
          `A shipment that is ${shipment.status} cannot be handed over`
        )
      shipment.handedOverAt = new Date(now).toISOString()
      recordChange(
        shipment,
        'HANDED_OVER',
        { label: 'Handed to the carrier', status: 'HANDED_OVER' },
        now
      )
      resolveStopByHandover(shipment, cancelDeps)
      return done('Shipment handed over')
    }
    default: {
      const skuId = typeof body.skuId === 'string' ? body.skuId.trim() : ''
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!shipment.lines.some((line) => line.skuId === skuId))
        return failure(
          422,
          'SKU_NOT_ON_PICK_LIST',
          `${skuId || 'That SKU'} is not on this pick list`
        )
      if (!reason || reason.length > MAX_REASON)
        return invalid('reason', `Give a reason of up to ${MAX_REASON} characters`)
      if (!isOpenForPicking(shipment))
        return failure(
          409,
          'SHIPMENT_NOT_PICKABLE',
          `A shipment that is ${shipment.status} cannot report a shortage`
        )
      shipment.shortage = { skuId, reason }
      recordChange(
        shipment,
        'PICK_BLOCKED',
        { label: 'We are checking stock for your order', status: 'PICK_BLOCKED' },
        now
      )
      return done('Shortage reported')
    }
  }
}
