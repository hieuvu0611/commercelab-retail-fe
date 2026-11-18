import type {
  PurchaseOrder,
  ReceivingInspection,
  StockAdjustment,
  Stocktake,
  Supplier,
  SupplierReturn,
} from '@/types/procurement'

export interface MockProcurementState {
  suppliers: Map<string, Supplier>
  purchaseOrders: Map<string, PurchaseOrder>
  inspections: Map<string, ReceivingInspection>
  supplierReturns: Map<string, SupplierReturn>
  stocktakes: Map<string, Stocktake>
  adjustments: Map<string, StockAdjustment>
}

let globalState: MockProcurementState | undefined

export function resetMockProcurementState(): MockProcurementState {
  const now = new Date().toISOString()
  const suppliers = new Map<string, Supplier>([
    [
      'SUP-EVEREST-01',
      {
        supplierId: 'SUP-EVEREST-01',
        name: 'Everest Outdoor Gear Co.',
        code: 'EVEREST',
        contactEmail: 'supply@everestgear.vn',
        phone: '0901234567',
        address: 'Lot 4, Tan Binh Industrial Park, HCMC',
        active: true,
        createdAt: now,
      },
    ],
    [
      'SUP-HYDRO-01',
      {
        supplierId: 'SUP-HYDRO-01',
        name: 'Hydro Flask Vietnam Ltd.',
        code: 'HYDRO',
        contactEmail: 'sales@hydroflask.vn',
        phone: '0912345678',
        address: 'District 7, HCMC',
        active: true,
        createdAt: now,
      },
    ],
  ])

  const purchaseOrders = new Map<string, PurchaseOrder>([
    [
      'PO-DEMO-001',
      {
        poId: 'PO-DEMO-001',
        supplierId: 'SUP-EVEREST-01',
        supplierName: 'Everest Outdoor Gear Co.',
        warehouseId: 'WH-HCM-01',
        status: 'APPROVED',
        totalAmountVnd: 15_000_000,
        createdBy: 'user-proc-mgr',
        approvedBy: 'user-ops-dir',
        approvedAt: now,
        notes: 'Initial test batch for backpacks',
        lines: [
          {
            skuId: 'SKU-BACKPACK-BLK',
            orderedQty: 100,
            unitCostVnd: 150_000,
            receivedQty: 0,
            damagedQty: 0,
            shortQty: 0,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
  ])

  globalState = {
    suppliers,
    purchaseOrders,
    inspections: new Map(),
    supplierReturns: new Map(),
    stocktakes: new Map(),
    adjustments: new Map(),
  }
  return globalState
}

export function getMockProcurementState(): MockProcurementState {
  if (!globalState) {
    globalState = resetMockProcurementState()
  }
  return globalState
}
