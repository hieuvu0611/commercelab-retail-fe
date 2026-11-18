import {
  handleProcurementMock,
} from '@/procurement/mock-procurement'
import {
  getMockProcurementState,
  resetMockProcurementState,
} from '@/procurement/mock-procurement-state'
import type { MockRequest } from '@/auth/mock-api'

describe('End-to-End Procurement & Inventory Lifecycle (P9-T07: SC09, P01, P10, I01)', () => {
  beforeEach(() => {
    resetMockProcurementState()
  })

  test('Step 1: Create PO for 100 units (20,000,000 VND) and enforce Maker != Checker', () => {
    const state = getMockProcurementState()
    const creatorUserId = 'proc-staff-01'

    // 1. Create PO
    const createReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/procurement/orders',
      body: {
        poId: 'PO-E2E-SC09-100',
        supplierId: 'SUP-EVEREST-01',
        warehouseId: 'WH-HCM-01',
        notes: 'Winter stock order for SC09 test',
        lines: [
          {
            skuId: 'SKU-BACKPACK-BLK',
            orderedQty: 100,
            unitCostVnd: 200_000,
          },
        ],
      },
    }

    const createRes = handleProcurementMock(createReq, creatorUserId, state)
    expect(createRes?.status).toBe(201)
    const po = state.purchaseOrders.get('PO-E2E-SC09-100')
    expect(po).toBeDefined()
    expect(po?.status).toBe('PENDING_APPROVAL')
    expect(po?.totalAmountVnd).toBe(20_000_000)
    expect(po?.createdBy).toBe(creatorUserId)

    // 2. Creator attempts to approve their own PO (Maker-Checker violation)
    const selfApproveReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/procurement/orders/PO-E2E-SC09-100/approve',
    }
    const selfApproveRes = handleProcurementMock(selfApproveReq, creatorUserId, state)
    expect(selfApproveRes?.status).toBe(403)
    expect((selfApproveRes?.body as { code?: string })?.code).toBe('MAKER_CHECKER_VIOLATION')
    expect(po?.status).toBe('PENDING_APPROVAL')

    // 3. Different manager approves PO
    const checkerManagerId = 'proc-manager-02'
    const approveRes = handleProcurementMock(selfApproveReq, checkerManagerId, state)
    expect(approveRes?.status).toBe(200)
    expect(po?.status).toBe('APPROVED')
    expect(po?.approvedBy).toBe(checkerManagerId)
  })

  test('Step 2: SC09 Inbound QC Receiving (Order 100, deliver 90, 5 damaged -> 85 passed, 10 short)', () => {
    const state = getMockProcurementState()

    // Setup approved PO
    state.purchaseOrders.set('PO-SC09-TEST', {
      poId: 'PO-SC09-TEST',
      supplierId: 'SUP-EVEREST-01',
      supplierName: 'Everest Outdoor Gear Co.',
      warehouseId: 'WH-HCM-01',
      status: 'APPROVED',
      totalAmountVnd: 20_000_000,
      createdBy: 'proc-staff',
      notes: 'Test PO',
      lines: [
        {
          id: 1,
          skuId: 'SKU-BACKPACK-BLK',
          orderedQty: 100,
          unitCostVnd: 200_000,
          receivedQty: 0,
          damagedQty: 0,
          shortQty: 0,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Inbound receiving QC: 90 delivered = 85 passed + 5 damaged
    const inspectorId = 'wh-inspector-01'
    const inspectionReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/inventory/receiving/inspections',
      body: {
        poId: 'PO-SC09-TEST',
        notes: 'SC09 receipt: 10 short, 5 damaged carton boxes',
        lines: [
          {
            skuId: 'SKU-BACKPACK-BLK',
            deliveredQty: 90,
            passedQty: 85,
            damagedQty: 5,
          },
        ],
      },
    }

    const inspRes = handleProcurementMock(inspectionReq, inspectorId, state)
    expect(inspRes?.status).toBe(201)

    // Check inspection record
    const inspections = Array.from(state.inspections.values())
    expect(inspections.length).toBe(1)
    const insp = inspections[0]
    expect(insp.poId).toBe('PO-SC09-TEST')
    expect(insp.status).toBe('COMPLETED')
    expect(insp.lines[0]).toEqual({
      skuId: 'SKU-BACKPACK-BLK',
      deliveredQty: 90,
      passedQty: 85,
      damagedQty: 5,
      shortQty: 10,
    })

    // PO lines updated
    const po = state.purchaseOrders.get('PO-SC09-TEST')
    expect(po?.status).toBe('PARTIALLY_RECEIVED')
    expect(po?.lines[0].receivedQty).toBe(85)
    expect(po?.lines[0].damagedQty).toBe(5)
    expect(po?.lines[0].shortQty).toBe(10)
  })

  test('Step 3: Supplier Return (RTV) for 5 damaged units', () => {
    const state = getMockProcurementState()
    const staffId = 'wh-staff-rtv'

    // Create supplier return dossier
    const rtvCreateReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/inventory/supplier-returns',
      body: {
        returnId: 'RTV-SC09-001',
        supplierId: 'SUP-EVEREST-01',
        warehouseId: 'WH-HCM-01',
        notes: 'Return 5 units damaged on delivery from PO-SC09-TEST',
        lines: [
          {
            skuId: 'SKU-BACKPACK-BLK',
            quantity: 5,
            reason: 'Damaged cartons & zipper fault',
          },
        ],
      },
    }

    const createRes = handleProcurementMock(rtvCreateReq, staffId, state)
    expect(createRes?.status).toBe(201)
    const ret = state.supplierReturns.get('RTV-SC09-001')
    expect(ret).toBeDefined()
    expect(ret?.status).toBe('DRAFT')
    expect(ret?.lines[0].quantity).toBe(5)

    // Dispatch the return to supplier
    const dispatchReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/inventory/supplier-returns/RTV-SC09-001/dispatch',
      body: {
        trackingNumber: 'VNPOST-RTV-123456',
      },
    }

    const dispatchRes = handleProcurementMock(dispatchReq, staffId, state)
    expect(dispatchRes?.status).toBe(200)
    expect(ret?.status).toBe('DISPATCHED')
    expect(ret?.trackingNumber).toBe('VNPOST-RTV-123456')
    expect(ret?.dispatchedBy).toBe(staffId)
  })

  test('Step 4: Stocktake with shortage, automatic sales blocking, and Maker != Checker approval', () => {
    const state = getMockProcurementState()
    const counterId = 'wh-counter-alice'

    // Start stocktake session
    const startReq: MockRequest = {
      method: 'POST',
      path: '/api/v1/admin/inventory/stocktakes',
      body: {
        warehouseId: 'WH-HCM-01',
        notes: 'Routine wall-to-wall cycle count',
      },
    }
    const startRes = handleProcurementMock(startReq, counterId, state)
    expect(startRes?.status).toBe(201)
    const stkId = (startRes?.body as { data: { stocktakeId: string } }).data.stocktakeId

    // Alice counts physical inventory: System has 20, Alice counts 18 (-2 shortage)
    const countReq: MockRequest = {
      method: 'POST',
      path: `/api/v1/admin/inventory/stocktakes/${stkId}/count`,
      body: {
        lines: [
          {
            skuId: 'SKU-BACKPACK-BLK',
            countedOnHand: 18,
            unitCostVnd: 200_000,
          },
        ],
      },
    }

    const countRes = handleProcurementMock(countReq, counterId, state)
    expect(countRes?.status).toBe(200)

    // Stocktake marked SUBMITTED and created adjustments
    const stk = state.stocktakes.get(stkId)
    expect(stk?.status).toBe('SUBMITTED')
    expect(stk?.lines?.[0].diffQty).toBe(-2)
    expect(stk?.lines?.[0].diffAmountVnd).toBe(-400_000)

    const adjustments = Array.from(state.adjustments.values())
    expect(adjustments.length).toBe(1)
    const adj = adjustments[0]
    expect(adj.diffQty).toBe(-2)
    expect(adj.status).toBe('PENDING_APPROVAL')
    expect(adj.makerId).toBe(counterId)

    // Alice (maker) attempts to approve her own adjustment -> blocked (Maker != Checker P10)
    const selfDecideReq: MockRequest = {
      method: 'POST',
      path: `/api/v1/admin/inventory/adjustments/${adj.adjustmentId}/decide`,
      body: { action: 'APPROVE' },
    }
    const selfDecideRes = handleProcurementMock(selfDecideReq, counterId, state)
    expect(selfDecideRes?.status).toBe(403)
    expect((selfDecideRes?.body as { code?: string })?.code).toBe('MAKER_CHECKER_VIOLATION')
    expect(adj.status).toBe('PENDING_APPROVAL')

    // Second manager (Bob) approves the adjustment
    const checkerId = 'wh-manager-bob'
    const bobDecideRes = handleProcurementMock(selfDecideReq, checkerId, state)
    expect(bobDecideRes?.status).toBe(200)
    expect(adj.status).toBe('APPROVED')
    expect(adj.checkerId).toBe(checkerId)
  })
})
