import type { MockRequest } from '@/auth/mock-api'
import { createMockFulfillmentState } from '@/fulfillment/mock-fulfillment'
import { createMockOrderState, type MockOrder } from '@/orders/mock-orders'
import {
  handleBackofficeReturnsMock,
  type BackofficeReturnsCaller,
  type BackofficeReturnsMockDeps,
} from '../mock-backoffice-returns'
import { createMockReturnsState, type MockReturn } from '../mock-returns-state'

const NOW = Date.parse('2026-11-16T12:00:00.000Z')

const staffUser: BackofficeReturnsCaller = {
  name: 'staff-lead-1',
  roles: ['SUPPORT_LEAD'],
  warehouseScopes: ['ALL'],
}

const checkerUser: BackofficeReturnsCaller = {
  name: 'checker-manager-2',
  roles: ['OPS_MGR'],
  warehouseScopes: ['ALL'],
}

function makeDeps(): BackofficeReturnsMockDeps {
  const orders = createMockOrderState()
  const fulfillment = createMockFulfillmentState()
  const returns = createMockReturnsState()

  const order: MockOrder = {
    orderId: 'O-001',
    userId: 'user-1',
    customerName: 'User 1',
    quoteId: 'Q-001',
    status: 'DELIVERED',
    paymentStatus: 'CAPTURED',
    failureCode: null,
    totalPayableVnd: 660000,
    paymentAttemptId: 'pay-1',
    createdAt: '2026-11-15T10:00:00.000Z',
    expiresAt: '2026-11-15T10:30:00.000Z',
    unknownDeadline: null,
    refundObligationVnd: 0,
    snapshot: {
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      voucherCode: 'SALE10',
      address: null,
      lines: [
        {
          skuId: 'BP-1',
          skuName: 'Backpack Explorer',
          orderedQuantity: 2,
          unitPriceVnd: 300000,
          lineDiscountVnd: 60000,
          allocatedUnitPaidVnd: 270000,
        },
      ],
    },
  }
  orders.orders.set('O-001', order)

  const rma: MockReturn = {
    returnId: 'RMA-001',
    orderId: 'O-001',
    userId: 'user-1',
    warehouseId: 'WH-HCM-01',
    reason: 'DEFECTIVE', // seller error
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
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    rejectionNote: '',
    refund: null,
    history: [{ at: '2026-11-16T10:00:00.000Z', type: 'REQUESTED', actor: 'customer' }],
  }
  returns.returns.set('RMA-001', rma)

  return {
    orders,
    fulfillment,
    returns,
    now: () => NOW,
  }
}

describe('mock backoffice returns API', () => {
  it('lists backoffice returns within staff scope', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'GET',
      path: '/admin/returns',
    }
    const res = handleBackofficeReturnsMock(req, staffUser, deps)
    expect(res?.status).toBe(200)
    const body = res?.body as { data: Array<{ returnId: string }> }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].returnId).toBe('RMA-001')
  })

  it('receives parcel at warehouse and moves status to RECEIVED', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'POST',
      path: '/admin/returns/RMA-001/receive',
    }
    const res = handleBackofficeReturnsMock(req, staffUser, deps)
    expect(res?.status).toBe(200)
    const body = res?.body as { data: { status: string; lines: Array<{ receivedQuantity: number }> } }
    expect(body.data.status).toBe('RECEIVED')
    expect(body.data.lines[0].receivedQuantity).toBe(1)
  })

  it('records QC inspection and proposes refund with seller fault shipping (P11)', () => {
    const deps = makeDeps()
    const req: MockRequest = {
      method: 'POST',
      path: '/admin/returns/RMA-001/qc',
      body: {
        results: [{ skuId: 'BP-1', passedQuantity: 1, failedQuantity: 0 }],
      },
    }
    const res = handleBackofficeReturnsMock(req, staffUser, deps)
    expect(res?.status).toBe(200)
    const body = res?.body as {
      data: {
        status: string
        refund: { amountVnd: number; goodsVnd: number; shippingVnd: number }
      }
    }
    expect(body.data.status).toBe('QC_PASSED')
    // 270k goods + 30k shipping = 300k
    expect(body.data.refund.goodsVnd).toBe(270000)
    expect(body.data.refund.shippingVnd).toBe(30000)
    expect(body.data.refund.amountVnd).toBe(300000)
  })

  it('disburses refund under 500k threshold directly (SC08)', () => {
    const deps = makeDeps()
    // First submit QC
    handleBackofficeReturnsMock(
      {
        method: 'POST',
        path: '/admin/returns/RMA-001/qc',
        body: { results: [{ skuId: 'BP-1', passedQuantity: 1, failedQuantity: 0 }] },
      },
      staffUser,
      deps
    )

    // Disburse refund
    const res = handleBackofficeReturnsMock(
      { method: 'POST', path: '/admin/returns/RMA-001/refund' },
      staffUser,
      deps
    )
    expect(res?.status).toBe(200)
    const body = res?.body as { data: { status: string; refund: { status: string } } }
    expect(body.data.status).toBe('REFUNDED')
    expect(body.data.refund.status).toBe('COMPLETED')
  })

  it('enforces Maker-Checker approval and prevents self-approval for > 500k refunds (P10)', () => {
    const deps = makeDeps()
    const rma = deps.returns.returns.get('RMA-001')!
    rma.status = 'QC_PASSED'
    rma.refund = {
      amountVnd: 570000,
      goodsVnd: 540000,
      shippingVnd: 30000,
      status: 'PENDING',
      proposedBy: 'staff-lead-1',
      requiredApproval: 'OPS_FINANCE',
      sellerErrorConfirmed: true,
    }

    // Direct refund disbursement must fail because > 500k requires approval
    const failRes = handleBackofficeReturnsMock(
      { method: 'POST', path: '/admin/returns/RMA-001/refund' },
      staffUser,
      deps
    )
    expect(failRes?.status).toBe(409)

    // Staff requests approval
    const reqAppRes = handleBackofficeReturnsMock(
      {
        method: 'POST',
        path: '/admin/returns/RMA-001/request-approval',
        body: { reason: 'Defective high-value order' },
      },
      staffUser,
      deps
    )
    expect(reqAppRes?.status).toBe(201)
    const appBody = reqAppRes?.body as { data: { id: string } }
    const approvalId = appBody.data.id

    // Self-approval must be rejected (maker != checker)
    const selfDecideRes = handleBackofficeReturnsMock(
      {
        method: 'POST',
        path: `/admin/approvals/${approvalId}/decide`,
        body: { action: 'APPROVE' },
      },
      staffUser,
      deps
    )
    expect(selfDecideRes?.status).toBe(403)

    // A different checker user approves
    const checkerDecideRes = handleBackofficeReturnsMock(
      {
        method: 'POST',
        path: `/admin/approvals/${approvalId}/decide`,
        body: { action: 'APPROVE' },
      },
      checkerUser,
      deps
    )
    expect(checkerDecideRes?.status).toBe(200)

    // Now disburse succeeds
    const successRes = handleBackofficeReturnsMock(
      { method: 'POST', path: '/admin/returns/RMA-001/refund' },
      staffUser,
      deps
    )
    expect(successRes?.status).toBe(200)
    const finalBody = successRes?.body as { data: { status: string } }
    expect(finalBody.data.status).toBe('REFUNDED')
  })

  it('links an exchange order for replacement (B06)', () => {
    const deps = makeDeps()
    const rma = deps.returns.returns.get('RMA-001')!
    rma.status = 'QC_PASSED'

    const res = handleBackofficeReturnsMock(
      { method: 'POST', path: '/admin/returns/RMA-001/exchange' },
      staffUser,
      deps
    )
    expect(res?.status).toBe(200)
    const body = res?.body as { data: { linkedOrderId: string } }
    expect(body.data.linkedOrderId).toMatch(/^O-EXCH-/)
  })
})
