import { storefrontApi } from '@/services/api/clients'

export type TransferStatus =
  | 'DRAFT'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'RECEIVED_WITH_DISCREPANCY'
  | 'CANCELLED'

export interface TransferItem {
  skuId: string
  quantity: number
  receivedGoodQty: number
  damagedQty: number
  missingQty: number
}

export interface WarehouseTransfer {
  transferId: string
  fromWarehouseId: string
  toWarehouseId: string
  status: TransferStatus
  createdBy: string
  dispatchedBy?: string
  receivedBy?: string
  exceptionCaseId?: string
  notes?: string
  items: TransferItem[]
  dispatchedAt?: string
  receivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TransferReceiveLine {
  skuId: string
  receivedGoodQty: number
  damagedQty: number
  missingQty: number
}

export const TRANSFERS_KEY = ['admin-inventory-transfers'] as const
const quiet = { skipUnauthorizedHandler: true } as const

const mockTransfers = new Map<string, WarehouseTransfer>()

function isMock(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
}

export async function listTransfers(warehouse?: string): Promise<WarehouseTransfer[]> {
  if (isMock()) {
    return Array.from(mockTransfers.values()).filter(
      (t) => !warehouse || warehouse === 'ALL' || t.fromWarehouseId === warehouse || t.toWarehouseId === warehouse
    )
  }
  const { data } = await storefrontApi.get<WarehouseTransfer[]>('/admin/inventory/transfers', {
    ...quiet,
    params: warehouse ? { warehouse } : undefined,
  })
  return data ?? []
}

export async function createTransfer(input: {
  fromWarehouseId: string
  toWarehouseId: string
  notes?: string
  items: Array<{ skuId: string; quantity: number }>
}): Promise<WarehouseTransfer> {
  if (isMock()) {
    const id = `TRF-MOCK-${Date.now()}`
    const now = new Date().toISOString()
    const created: WarehouseTransfer = {
      transferId: id,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      status: 'DRAFT',
      createdBy: 'staff-mock',
      notes: input.notes,
      items: input.items.map((it) => ({
        skuId: it.skuId,
        quantity: it.quantity,
        receivedGoodQty: 0,
        damagedQty: 0,
        missingQty: 0,
      })),
      createdAt: now,
      updatedAt: now,
    }
    mockTransfers.set(id, created)
    return created
  }
  const { data } = await storefrontApi.post<WarehouseTransfer>(
    '/admin/inventory/transfers',
    input,
    quiet
  )
  return data!
}

export async function dispatchTransfer(transferId: string): Promise<WarehouseTransfer> {
  if (isMock()) {
    const t = mockTransfers.get(transferId)
    if (!t) throw new Error('Transfer not found')
    t.status = 'IN_TRANSIT'
    t.dispatchedAt = new Date().toISOString()
    t.updatedAt = t.dispatchedAt
    return { ...t }
  }
  const { data } = await storefrontApi.post<WarehouseTransfer>(
    `/admin/inventory/transfers/${encodeURIComponent(transferId)}/dispatch`,
    {},
    quiet
  )
  return data!
}

export async function receiveTransfer(
  transferId: string,
  lines: TransferReceiveLine[]
): Promise<WarehouseTransfer> {
  if (isMock()) {
    const t = mockTransfers.get(transferId)
    if (!t) throw new Error('Transfer not found')
    let hasDiscrepancy = false
    t.items = t.items.map((it) => {
      const rec = lines.find((l) => l.skuId === it.skuId)
      if (!rec) return it
      if (rec.damagedQty > 0 || rec.missingQty > 0) hasDiscrepancy = true
      return { ...it, ...rec }
    })
    t.status = hasDiscrepancy ? 'RECEIVED_WITH_DISCREPANCY' : 'RECEIVED'
    if (hasDiscrepancy) t.exceptionCaseId = `CASE-MOCK-${Date.now()}`
    t.receivedAt = new Date().toISOString()
    t.updatedAt = t.receivedAt
    return { ...t }
  }
  const { data } = await storefrontApi.post<WarehouseTransfer>(
    `/admin/inventory/transfers/${encodeURIComponent(transferId)}/receive`,
    { lines },
    quiet
  )
  return data!
}
