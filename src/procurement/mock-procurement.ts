import type { MockRequest, MockResponse } from '@/auth/mock-api'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  ReceivingInspection,
  StockAdjustment,
  Stocktake,
  Supplier,
  SupplierReturn,
} from '@/types/procurement'
import {
  getMockProcurementState,
  type MockProcurementState,
} from './mock-procurement-state'

const ok = (data: unknown, message = 'OK', status = 200): MockResponse => ({
  status,
  body: { message, data, status },
})

const failure = (status: number, code: string, message: string): MockResponse => ({
  status,
  body: { message, code, status },
})

export function handleProcurementMock(
  request: MockRequest,
  userId: string | null,
  state: MockProcurementState = getMockProcurementState()
): MockResponse | null {
  const { method, path } = request
  const body = (typeof request.body === 'object' && request.body !== null ? request.body : {}) as Record<string, unknown>

  // Suppliers
  if (method === 'GET' && path === '/api/v1/admin/procurement/suppliers') {
    return ok(Array.from(state.suppliers.values()))
  }

  if (method === 'POST' && path === '/api/v1/admin/procurement/suppliers') {
    const name = String(body.name || '').trim()
    const code = String(body.code || '').trim()
    if (!name || !code) {
      return failure(400, 'INVALID_PAYLOAD', 'Supplier name and code are required')
    }
    const supplierId = String(body.supplierId || `SUP-${Date.now() % 10000}`)
    const supplier: Supplier = {
      supplierId,
      name,
      code,
      contactEmail: String(body.contactEmail || ''),
      phone: String(body.phone || ''),
      address: String(body.address || ''),
      active: true,
      createdAt: new Date().toISOString(),
    }
    state.suppliers.set(supplierId, supplier)
    return ok(supplier, 'Supplier created', 201)
  }

  // POs
  if (method === 'GET' && path === '/api/v1/admin/procurement/orders') {
    const list = Array.from(state.purchaseOrders.values())
    return ok(list)
  }

  const poMatch = path.match(/^\/api\/v1\/admin\/procurement\/orders\/([^/]+)$/)
  if (method === 'GET' && poMatch) {
    const po = state.purchaseOrders.get(poMatch[1])
    if (!po) return failure(404, 'PO_NOT_FOUND', 'Purchase order not found')
    return ok(po)
  }

  if (method === 'POST' && path === '/api/v1/admin/procurement/orders') {
    const supplierId = String(body.supplierId || '')
    const lines = (body.lines as PurchaseOrderLine[]) || []
    if (!supplierId || lines.length === 0) {
      return failure(400, 'INVALID_PAYLOAD', 'supplierId and valid lines are required')
    }
    let total = 0
    for (const l of lines) {
      if (!l.skuId || l.orderedQty <= 0 || l.unitCostVnd < 0) {
        return failure(400, 'INVALID_LINES', 'Invalid line quantities or costs')
      }
      total += l.orderedQty * l.unitCostVnd
    }
    const poId = String(body.poId || `PO-${Date.now().toString().slice(-6)}`)
    const sup = state.suppliers.get(supplierId)
    const po: PurchaseOrder = {
      poId,
      supplierId,
      supplierName: sup?.name,
      warehouseId: String(body.warehouseId || 'WH-HCM-01'),
      status: 'PENDING_APPROVAL',
      totalAmountVnd: total,
      createdBy: userId || 'staff-creator',
      notes: String(body.notes || ''),
      lines: lines.map((l, i) => ({
        ...l,
        id: i + 1,
        receivedQty: 0,
        damagedQty: 0,
        shortQty: 0,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.purchaseOrders.set(poId, po)
    return ok(po, 'Purchase order created', 201)
  }

  const approveMatch = path.match(/^\/api\/v1\/admin\/procurement\/orders\/([^/]+)\/approve$/)
  if (method === 'POST' && approveMatch) {
    const po = state.purchaseOrders.get(approveMatch[1])
    if (!po) return failure(404, 'PO_NOT_FOUND', 'Purchase order not found')

    const approverId = userId || 'approver-user'
    // Maker != Checker (P10)
    if (po.createdBy === approverId) {
      return failure(403, 'MAKER_CHECKER_VIOLATION', 'PO creator cannot approve their own order (P10)')
    }

    po.status = 'APPROVED'
    po.approvedBy = approverId
    po.approvedAt = new Date().toISOString()
    po.updatedAt = new Date().toISOString()
    state.purchaseOrders.set(po.poId, po)
    return ok(po, 'Purchase order approved')
  }

  const rejectMatch = path.match(/^\/api\/v1\/admin\/procurement\/orders\/([^/]+)\/reject$/)
  if (method === 'POST' && rejectMatch) {
    const po = state.purchaseOrders.get(rejectMatch[1])
    if (!po) return failure(404, 'PO_NOT_FOUND', 'Purchase order not found')
    po.status = 'REJECTED'
    po.notes = `${po.notes} | Rejected: ${String(body.reason || '')}`
    po.updatedAt = new Date().toISOString()
    state.purchaseOrders.set(po.poId, po)
    return ok(po, 'Purchase order rejected')
  }

  // Receiving Inspections (SC09)
  if (method === 'GET' && path === '/api/v1/admin/inventory/receiving/inspections') {
    return ok(Array.from(state.inspections.values()))
  }

  if (method === 'POST' && path === '/api/v1/admin/inventory/receiving/inspections') {
    const poId = String(body.poId || '')
    const lines = (body.lines as Array<{ skuId: string; deliveredQty: number; passedQty: number; damagedQty: number }>) || []
    const po = state.purchaseOrders.get(poId)
    if (!po) return failure(404, 'PO_NOT_FOUND', 'PO not found')
    if (lines.length === 0) return failure(400, 'INVALID_PAYLOAD', 'Lines required')

    const processedLines = []
    for (const l of lines) {
      if (l.deliveredQty !== l.passedQty + l.damagedQty) {
        return failure(400, 'MATH_MISMATCH', 'deliveredQty must equal passedQty + damagedQty')
      }
      const poLine = po.lines.find((pl) => pl.skuId === l.skuId)
      const ordered = poLine?.orderedQty || l.deliveredQty
      const shortQty = Math.max(0, ordered - l.deliveredQty)
      processedLines.push({
        skuId: l.skuId,
        deliveredQty: l.deliveredQty,
        passedQty: l.passedQty,
        damagedQty: l.damagedQty,
        shortQty,
      })
      if (poLine) {
        poLine.receivedQty = (poLine.receivedQty || 0) + l.passedQty
        poLine.damagedQty = (poLine.damagedQty || 0) + l.damagedQty
        poLine.shortQty = shortQty
      }
    }

    const inspectionId = `INSP-${Date.now().toString().slice(-6)}`
    const insp: ReceivingInspection = {
      inspectionId,
      poId,
      warehouseId: po.warehouseId,
      inspectorId: userId || 'wh-staff',
      status: 'COMPLETED',
      notes: String(body.notes || ''),
      lines: processedLines,
      createdAt: new Date().toISOString(),
    }
    state.inspections.set(inspectionId, insp)
    po.status = 'PARTIALLY_RECEIVED'
    state.purchaseOrders.set(po.poId, po)
    return ok(insp, 'Goods received and inspected', 201)
  }

  // Supplier Returns
  if (method === 'GET' && path === '/api/v1/admin/inventory/supplier-returns') {
    return ok(Array.from(state.supplierReturns.values()))
  }

  if (method === 'POST' && path === '/api/v1/admin/inventory/supplier-returns') {
    const supplierId = String(body.supplierId || '')
    const lines = (body.lines as Array<{ skuId: string; quantity: number; reason: string }>) || []
    if (!supplierId || lines.length === 0) {
      return failure(400, 'INVALID_PAYLOAD', 'supplierId and lines required')
    }
    const returnId = String(body.returnId || `RTV-${Date.now().toString().slice(-6)}`)
    const sup = state.suppliers.get(supplierId)
    const ret: SupplierReturn = {
      returnId,
      supplierId,
      supplierName: sup?.name,
      warehouseId: String(body.warehouseId || 'WH-HCM-01'),
      status: 'DRAFT',
      createdBy: userId || 'wh-staff',
      notes: String(body.notes || ''),
      lines,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.supplierReturns.set(returnId, ret)
    return ok(ret, 'Supplier return created', 201)
  }

  const rtvDispatchMatch = path.match(/^\/api\/v1\/admin\/inventory\/supplier-returns\/([^/]+)\/dispatch$/)
  if (method === 'POST' && rtvDispatchMatch) {
    const ret = state.supplierReturns.get(rtvDispatchMatch[1])
    if (!ret) return failure(404, 'NOT_FOUND', 'Return not found')
    ret.status = 'DISPATCHED'
    ret.dispatchedBy = userId || 'wh-staff'
    ret.dispatchedAt = new Date().toISOString()
    ret.trackingNumber = String(body.trackingNumber || '')
    ret.updatedAt = new Date().toISOString()
    state.supplierReturns.set(ret.returnId, ret)
    return ok(ret, 'Supplier return dispatched')
  }

  // Stocktakes & Adjustments
  if (method === 'GET' && path === '/api/v1/admin/inventory/stocktakes') {
    return ok(Array.from(state.stocktakes.values()))
  }

  if (method === 'POST' && path === '/api/v1/admin/inventory/stocktakes') {
    const stocktakeId = `STK-${Date.now().toString().slice(-6)}`
    const stk: Stocktake = {
      stocktakeId,
      warehouseId: String(body.warehouseId || 'WH-HCM-01'),
      status: 'IN_PROGRESS',
      startedBy: userId || 'wh-staff',
      notes: String(body.notes || ''),
      createdAt: new Date().toISOString(),
    }
    state.stocktakes.set(stocktakeId, stk)
    return ok(stk, 'Stocktake session created', 201)
  }

  const stkMatch = path.match(/^\/api\/v1\/admin\/inventory\/stocktakes\/([^/]+)$/)
  if (method === 'GET' && stkMatch) {
    const stk = state.stocktakes.get(stkMatch[1])
    if (!stk) return failure(404, 'NOT_FOUND', 'Stocktake not found')
    return ok(stk)
  }

  const stkCountMatch = path.match(/^\/api\/v1\/admin\/inventory\/stocktakes\/([^/]+)\/count$/)
  if (method === 'POST' && stkCountMatch) {
    const stk = state.stocktakes.get(stkCountMatch[1])
    if (!stk) return failure(404, 'NOT_FOUND', 'Stocktake not found')
    const lines = (body.lines as Array<{ skuId: string; countedOnHand: number; unitCostVnd?: number }>) || []
    const adjustments: StockAdjustment[] = []
    const processedLines = []

    for (const l of lines) {
      const sysOnHand = 20 // baseline mock
      const diff = l.countedOnHand - sysOnHand
      const unitCost = l.unitCostVnd || 100_000
      const diffAmount = diff * unitCost

      processedLines.push({
        skuId: l.skuId,
        systemOnHand: sysOnHand,
        countedOnHand: l.countedOnHand,
        diffQty: diff,
        unitCostVnd: unitCost,
        diffAmountVnd: diffAmount,
      })

      if (diff !== 0) {
        const adjId = `ADJ-${Date.now().toString().slice(-6)}-${adjustments.length + 1}`
        const adj: StockAdjustment = {
          adjustmentId: adjId,
          stocktakeId: stk.stocktakeId,
          warehouseId: stk.warehouseId,
          skuId: l.skuId,
          diffQty: diff,
          unitCostVnd: unitCost,
          diffAmountVnd: diffAmount,
          status: 'PENDING_APPROVAL',
          makerId: stk.startedBy,
          reason: `Count discrepancy in stocktake ${stk.stocktakeId}`,
          createdAt: new Date().toISOString(),
        }
        state.adjustments.set(adjId, adj)
        adjustments.push(adj)
      }
    }

    stk.status = 'SUBMITTED'
    stk.lines = processedLines
    stk.completedAt = new Date().toISOString()
    state.stocktakes.set(stk.stocktakeId, stk)
    return ok({ stocktake: stk, adjustments })
  }

  if (method === 'GET' && path === '/api/v1/admin/inventory/adjustments') {
    return ok(Array.from(state.adjustments.values()))
  }

  const adjDecideMatch = path.match(/^\/api\/v1\/admin\/inventory\/adjustments\/([^/]+)\/decide$/)
  if (method === 'POST' && adjDecideMatch) {
    const adj = state.adjustments.get(adjDecideMatch[1])
    if (!adj) return failure(404, 'NOT_FOUND', 'Adjustment not found')
    const approverId = userId || 'checker-mgr'
    if (adj.makerId === approverId) {
      return failure(403, 'MAKER_CHECKER_VIOLATION', 'Requester cannot approve their own adjustment (P10)')
    }
    const action = String(body.action || 'APPROVE')
    adj.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    adj.checkerId = approverId
    adj.decidedAt = new Date().toISOString()
    adj.reason = `${adj.reason} | Note: ${String(body.note || '')}`
    state.adjustments.set(adj.adjustmentId, adj)
    return ok(adj, 'Adjustment decided')
  }

  return null
}
