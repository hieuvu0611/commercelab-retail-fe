import type { MockRequest, MockResponse } from '@/auth/mock-api'
import {
  getMockFulfillmentState,
  isoTime,
  type MockFulfillmentState,
} from '@/fulfillment/mock-fulfillment'
import { getMockOrderState, type MockOrderState } from '@/orders/mock-orders'
import { RETURN_REASONS } from '@/types/returns'
import {
  getMockReturnsState,
  type MockApprovalRecord,
  type MockReturn,
  type MockReturnsState,
} from './mock-returns-state'

export interface BackofficeReturnsCaller {
  name: string
  roles: string[]
  warehouseScopes: string[]
}

export interface BackofficeReturnsMockDeps {
  orders: MockOrderState
  fulfillment: MockFulfillmentState
  returns: MockReturnsState
  now: () => number
}

const defaultDeps = (): BackofficeReturnsMockDeps => ({
  orders: getMockOrderState(),
  fulfillment: getMockFulfillmentState(),
  returns: getMockReturnsState(),
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

const ok = (data: unknown, message = 'OK', status = 200, metadata?: Record<string, unknown>): MockResponse => ({
  status,
  body: {
    message,
    data,
    ...(metadata && { metadata }),
  },
})

const STAFF_ROLES = [
  'SUPPORT_AGENT',
  'SUPPORT_LEAD',
  'SUPPORT_STAFF',
  'WAREHOUSE_STAFF',
  'WAREHOUSE_MGR',
  'FINANCE',
  'FINANCE_STAFF',
  'FINANCE_MGR',
  'OPS_MGR',
  'ACCESS_ADMIN',
  'ADMIN',
]

const inScope = (caller: BackofficeReturnsCaller, warehouseId: string) =>
  caller.roles.includes('ADMIN') ||
  caller.warehouseScopes.includes('ALL') ||
  caller.warehouseScopes.includes(warehouseId)

function seedReturnsIfEmpty(deps: BackofficeReturnsMockDeps) {
  if (deps.returns.returns.size > 0) return

  const at = isoTime(deps.now() - 3600 * 1000)
  const item: MockReturn = {
    returnId: 'RMA-001',
    orderId: 'O-001',
    userId: 'user-001',
    warehouseId: 'WH-HCM-01',
    reason: 'CHANGED_MIND',
    status: 'REQUESTED',
    lines: [
      {
        skuId: 'BP-1',
        skuName: 'Backpack Explorer',
        quantity: 1,
        receivedQuantity: 0,
        qcPassed: 0,
        qcFailed: 0,
        allocatedUnitPaidVnd: 270000,
      },
    ],
    createdAt: at,
    updatedAt: at,
    rejectionNote: '',
    refund: null,
    history: [{ at, type: 'REQUESTED', actor: 'customer' }],
  }
  deps.returns.returns.set('RMA-001', item)
}

export function handleBackofficeReturnsMock(
  request: MockRequest,
  caller: BackofficeReturnsCaller | null,
  deps: BackofficeReturnsMockDeps = defaultDeps()
): MockResponse | null {
  const { method, path } = request

  // Match /admin/returns and /admin/approvals
  const isListReturns = method === 'GET' && path === '/admin/returns'
  const isReturnDetail = method === 'GET' && path.match(/^\/admin\/returns\/([^/]+)$/)
  const isReturnAction = method === 'POST' && path.match(/^\/admin\/returns\/([^/]+)\/(receive|qc|refund|request-approval|reject|exchange)$/)
  const isListApprovals = method === 'GET' && path === '/admin/approvals'
  const isDecideApproval = method === 'POST' && path.match(/^\/admin\/approvals\/([^/]+)\/decide$/)

  if (!isListReturns && !isReturnDetail && !isReturnAction && !isListApprovals && !isDecideApproval) {
    return null
  }

  if (!caller) {
    return failure(401, 'UNAUTHORIZED', 'A valid staff access token is required')
  }

  const hasStaffRole = caller.roles.some((r) => STAFF_ROLES.includes(r))
  if (!hasStaffRole) {
    return failure(403, 'FORBIDDEN', 'Staff permission required for returns administration')
  }

  seedReturnsIfEmpty(deps)

  // 1. List Returns
  if (isListReturns) {
    const status = request.query?.status
    const warehouseId = request.query?.warehouseId
    const orderId = request.query?.orderId

    const all = [...deps.returns.returns.values()]
      .filter((r) => inScope(caller, r.warehouseId))
      .filter((r) => (!status || r.status === status))
      .filter((r) => (!warehouseId || r.warehouseId === warehouseId))
      .filter((r) => (!orderId || r.orderId === orderId))
      .reverse()

    return ok(all, 'Returns retrieved successfully', 200, {
      total: all.length,
      page: 1,
      pageCount: 1,
      limit: 20,
    })
  }

  // 2. Return Detail
  if (isReturnDetail) {
    const rmaId = decodeURIComponent(isReturnDetail[1])
    const item = deps.returns.returns.get(rmaId)
    if (!item) {
      return failure(404, 'RETURN_NOT_FOUND', `Return ${rmaId} not found`)
    }
    if (!inScope(caller, item.warehouseId)) {
      return failure(403, 'FORBIDDEN_WAREHOUSE_SCOPE', 'Return belongs to a warehouse outside your scope')
    }
    return ok(item, 'Return detail retrieved')
  }

  // 3. Return Actions
  if (isReturnAction) {
    const rmaId = decodeURIComponent(isReturnAction[1])
    const action = isReturnAction[2]
    const item = deps.returns.returns.get(rmaId)
    if (!item) {
      return failure(404, 'RETURN_NOT_FOUND', `Return ${rmaId} not found`)
    }
    if (!inScope(caller, item.warehouseId)) {
      return failure(403, 'FORBIDDEN_WAREHOUSE_SCOPE', 'Return belongs to a warehouse outside your scope')
    }

    const at = isoTime(deps.now())
    const body =
      request.body !== null && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>)
        : {}

    // 3a. Receive
    if (action === 'receive') {
      item.status = 'RECEIVED'
      item.updatedAt = at
      for (const line of item.lines) {
        line.receivedQuantity = line.quantity
      }
      item.history.push({ at, type: 'RECEIVED', actor: caller.name })
      return ok(item, 'Return parcel received by warehouse')
    }

    // 3b. QC
    if (action === 'qc') {
      const results = (Array.isArray(body.results) ? body.results : []) as Array<{
        skuId: string
        passedQuantity: number
        failedQuantity: number
      }>

      let totalPassed = 0
      let _totalFailed = 0
      let goodsVnd = 0

      for (const res of results) {
        const line = item.lines.find((l) => l.skuId === res.skuId)
        if (line) {
          line.qcPassed = res.passedQuantity
          line.qcFailed = res.failedQuantity
          totalPassed += res.passedQuantity
          _totalFailed += res.failedQuantity
          goodsVnd += res.passedQuantity * line.allocatedUnitPaidVnd
        }
      }

      item.status = totalPassed > 0 ? 'QC_PASSED' : 'QC_FAILED'
      item.updatedAt = at
      item.history.push({ at, type: 'QC_INSPECTED', actor: caller.name })

      // Calculate refund
      const isSellerError = RETURN_REASONS.find((r) => r.code === item.reason)?.isSellerError ?? false
      let shippingVnd = 0
      if (isSellerError && totalPassed > 0) {
        const order = deps.orders.orders.get(item.orderId)
        shippingVnd = order?.snapshot.shippingFeeVnd ?? 0
      }

      const totalRefundVnd = goodsVnd + shippingVnd
      if (totalRefundVnd > 0) {
        const requiredApproval = totalRefundVnd > 500000 ? 'OPS_FINANCE' : 'SUPPORT_LEAD'
        item.refund = {
          amountVnd: totalRefundVnd,
          goodsVnd,
          shippingVnd,
          status: 'PENDING',
          proposedBy: caller.name,
          requiredApproval,
          sellerErrorConfirmed: isSellerError,
        }
      }

      return ok(item, 'QC inspection recorded successfully')
    }

    // 3c. Disburse Refund
    if (action === 'refund') {
      if (!item.refund) {
        return failure(400, 'NO_REFUND_PROPOSED', 'No refund has been proposed for this return')
      }
      if (item.status === 'REFUNDED') {
        return ok(item, 'Already refunded')
      }

      // Check Maker-Checker approval threshold (> 500k)
      if (item.refund.amountVnd > 500000) {
        const approval = [...deps.returns.approvals.values()].find(
          (a) => a.rmaId === item.returnId && a.status === 'APPROVED'
        )
        if (!approval) {
          return failure(
            409,
            'APPROVAL_REQUIRED',
            'Refund exceeds 500,000 VND threshold and requires Maker-Checker approval.'
          )
        }
      }

      item.status = 'REFUNDED'
      item.refund.status = 'COMPLETED'
      item.updatedAt = at
      item.history.push({ at, type: 'REFUNDED', actor: caller.name })
      return ok(item, 'Refund disbursed successfully')
    }

    // 3d. Request Approval
    if (action === 'request-approval') {
      if (!item.refund) {
        return failure(400, 'NO_REFUND_PROPOSED', 'No refund proposed to approve')
      }
      deps.returns.counter += 1
      const id = `APP-${String(deps.returns.counter).padStart(3, '0')}`
      const approval: MockApprovalRecord = {
        id,
        rmaId: item.returnId,
        makerUserId: caller.name,
        requestType: 'HIGH_VALUE_REFUND',
        amountVnd: item.refund.amountVnd,
        status: 'PENDING',
        reason: typeof body.reason === 'string' ? body.reason : 'Refund above threshold',
        createdAt: at,
        updatedAt: at,
      }
      deps.returns.approvals.set(id, approval)
      item.history.push({ at, type: 'APPROVAL_REQUESTED', actor: caller.name })
      return ok(approval, 'Approval requested successfully', 201)
    }

    // 3e. Reject
    if (action === 'reject') {
      const note = typeof body.note === 'string' ? body.note : 'Rejected by staff'
      item.status = 'REJECTED'
      item.rejectionNote = note
      item.updatedAt = at
      item.history.push({ at, type: 'REJECTED', actor: caller.name })
      return ok(item, 'Return rejected successfully')
    }

    // 3f. Exchange
    if (action === 'exchange') {
      const _replacementSkuId =
        typeof body.replacementSkuId === 'string' && body.replacementSkuId
          ? body.replacementSkuId
          : item.lines[0]?.skuId ?? 'BP-1'

      const newOrderId = `O-EXCH-${deps.returns.counter + 1}`
      item.linkedOrderId = newOrderId
      item.history.push({ at, type: 'EXCHANGE_LINKED', actor: caller.name })
      return ok(item, `Exchange order ${newOrderId} linked successfully`)
    }
  }

  // 4. List Approvals
  if (isListApprovals) {
    const list = [...deps.returns.approvals.values()].reverse()
    return ok(list, 'Approvals retrieved successfully')
  }

  // 5. Decide Approval
  if (isDecideApproval) {
    const approvalId = decodeURIComponent(isDecideApproval[1])
    const approval = deps.returns.approvals.get(approvalId)
    if (!approval) {
      return failure(404, 'APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`)
    }

    // Enforce Maker != Checker (P10)
    if (approval.makerUserId === caller.name) {
      return failure(403, 'MAKER_CHECKER_SELF_APPROVAL', 'Maker and checker cannot be the same user')
    }

    const body =
      request.body !== null && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>)
        : {}

    const action = body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    const at = isoTime(deps.now())

    approval.status = action
    approval.checkerUserId = caller.name
    approval.checkerRole = caller.roles[0] || 'SUPPORT_LEAD'
    approval.decisionNote = typeof body.note === 'string' ? body.note : ''
    approval.updatedAt = at

    return ok(approval, `Approval ${action.toLowerCase()} successfully`)
  }

  return null
}
