import { toReturnCase, toReturnLine, toReturnRefund } from '../adapters'

describe('returns adapters', () => {
  it('maps return line with fallbacks', () => {
    const line = toReturnLine({
      skuId: 'BP-1',
      skuName: 'Backpack',
      quantity: 2,
      receivedQuantity: 2,
      qcPassedQuantity: 1,
      qcFailedQuantity: 1,
      allocatedUnitPaidVnd: 270000,
    })

    expect(line).toEqual({
      skuId: 'BP-1',
      skuName: 'Backpack',
      quantity: 2,
      receivedQuantity: 2,
      passedQuantity: 1,
      failedQuantity: 1,
      allocatedUnitPaidVnd: 270000,
    })
  })

  it('maps return refund with pending and completed statuses', () => {
    expect(toReturnRefund(null)).toBeNull()
    expect(toReturnRefund({ amountVnd: 0 })).toBeNull()

    const pending = toReturnRefund({
      amountVnd: 270000,
      goodsVnd: 270000,
      shippingVnd: 0,
      status: 'PENDING',
    })
    expect(pending).toEqual({
      amountVnd: 270000,
      goodsVnd: 270000,
      shippingVnd: 0,
      status: 'PENDING',
    })

    const completed = toReturnRefund({
      amountVnd: 300000,
      goodsVnd: 270000,
      shippingVnd: 30000,
      status: 'COMPLETED',
    })
    expect(completed?.status).toBe('COMPLETED')
  })

  it('maps full return case', () => {
    const raw = {
      returnId: 'RMA-001',
      orderId: 'O-001',
      status: 'REQUESTED',
      reason: 'CHANGED_MIND',
      items: [
        {
          skuId: 'BP-1',
          skuName: 'Backpack',
          quantity: 1,
          receivedQuantity: 0,
          qcPassedQuantity: 0,
          qcFailedQuantity: 0,
          allocatedUnitPaidVnd: 270000,
        },
      ],
      createdAt: '2026-11-16T10:00:00.000Z',
      refund: null,
      rejectionNote: '',
    }

    const rma = toReturnCase(raw)
    expect(rma.returnId).toBe('RMA-001')
    expect(rma.orderId).toBe('O-001')
    expect(rma.status).toBe('REQUESTED')
    expect(rma.reason).toBe('CHANGED_MIND')
    expect(rma.lines).toHaveLength(1)
    expect(rma.lines[0].skuId).toBe('BP-1')
  })
})
