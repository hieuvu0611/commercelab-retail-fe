import {
  toOrder,
  toOrderDetail,
  toOrderSummary,
  toStaffOrderDetail,
  toStaffOrderRow,
} from '../adapters'

describe('order adapters', () => {
  it('reads an unrecognised status as being verified, never as payable', () => {
    expect(
      toOrder({ orderId: 'O-1', status: 'SOMETHING_NEW', paymentStatus: 'WEIRD' })
    ).toMatchObject({
      status: 'UNKNOWN_HOLD',
      paymentStatus: 'UNPAID',
    })
  })

  it('maps the history row', () => {
    expect(
      toOrderSummary({
        orderId: 'O-1',
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        totalPayableVnd: 660000,
        createdAt: '2026-11-15T10:00:00.000Z',
        itemCount: 3,
      })
    ).toEqual({
      orderId: 'O-1',
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      paymentMethod: 'PREPAID',
      totalPayableVnd: 660000,
      failureCode: null,
      createdAt: '2026-11-15T10:00:00.000Z',
      itemCount: 3,
    })

    expect(
      toOrderSummary({
        orderId: 'O-COD',
        status: 'CONFIRMED',
        paymentStatus: 'COD_PENDING',
        paymentMethod: 'COD',
        totalPayableVnd: 500000,
        createdAt: '2026-11-15T10:00:00.000Z',
        itemCount: 1,
      })
    ).toEqual({
      orderId: 'O-COD',
      status: 'CONFIRMED',
      paymentStatus: 'COD_PENDING',
      paymentMethod: 'COD',
      totalPayableVnd: 500000,
      failureCode: null,
      createdAt: '2026-11-15T10:00:00.000Z',
      itemCount: 1,
    })
  })

  it('reads the payment and the refund nested in the order detail', () => {
    expect(
      toOrder({
        orderId: 'O-1',
        status: 'FAILED_CLOSED',
        paymentStatus: 'REFUND_PENDING',
        failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
        totalPayableVnd: 660000,
        expiresAt: '2026-11-15T10:10:00.000Z',
        payment: { attemptId: 'PAY-O-1', status: 'REFUND_PENDING', capturedAmountVnd: 660000 },
        refundObligation: { amountVnd: 660000, status: 'PENDING' },
      })
    ).toMatchObject({
      paymentAttemptId: 'PAY-O-1',
      refundObligationVnd: 660000,
      expiresAt: '2026-11-15T10:10:00.000Z',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
    })
    expect(toOrder({ orderId: 'O-1', refundObligation: null }).refundObligationVnd).toBe(0)
  })

  it('maps the frozen snapshot of the detail and survives missing parts', () => {
    const detail = toOrderDetail({
      orderId: 'O-1',
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      totalPayableVnd: 660000,
      subtotalVnd: 700000,
      discountVnd: 70000,
      shippingFeeVnd: 30000,
      voucherCode: 'WELCOME10',
      shippingAddress: {
        recipient: 'Lan',
        phone: '+84901234567',
        line1: 'x',
        ward: 'w',
        district: 'd',
        province: 'p',
      },
      items: [
        {
          skuId: 'A',
          skuName: 'City Backpack',
          imageUrl: 'https://img/x.jpg',
          quantity: 2,
          unitPriceVnd: 300000,
          lineDiscountVnd: 60000,
          allocatedUnitPaidVnd: 270000,
        },
      ],
    })
    expect(detail.lines[0]).toMatchObject({
      skuName: 'City Backpack',
      imageUrl: 'https://img/x.jpg',
      lineSubtotalVnd: 600000,
      lineNetPayableVnd: 540000,
      allocatedUnitPaidVnd: 270000,
    })
    expect(detail.address?.recipient).toBe('Lan')
    expect(toOrderDetail({}).lines).toEqual([])
    expect(toOrderDetail({}).address).toBeNull()
  })
})

describe('staff order adapters', () => {
  it('maps a list row with the masked recipient flat on the order', () => {
    expect(
      toStaffOrderRow({
        orderId: 'O-1',
        customerId: 'user-lan',
        status: 'UNKNOWN_HOLD',
        paymentStatus: 'UNKNOWN_30M',
        warehouseId: 'WH-HCM-01',
        totalPayableVnd: 660000,
        createdAt: '2026-11-15T10:00:00.000Z',
        itemCount: 3,
        recipient: 'Lan N.',
        phone: '+84*******567',
        district: 'District 1',
        province: 'HCMC',
      })
    ).toMatchObject({
      orderId: 'O-1',
      status: 'UNKNOWN_HOLD',
      customerId: 'user-lan',
      warehouseId: 'WH-HCM-01',
      itemCount: 3,
      shipTo: { recipient: 'Lan N.', phone: '+84*******567' },
    })
  })

  it('maps the detail with the minimal delivery information and payment facts', () => {
    const detail = toStaffOrderDetail({
      orderId: 'O-1',
      customerId: 'user-lan',
      status: 'FAILED_CLOSED',
      paymentStatus: 'REFUND_PENDING',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      totalPayableVnd: 660000,
      recipient: 'Lan N.',
      phone: '+84*****567',
      district: 'District 1',
      province: 'HCMC',
      payment: { attemptId: 'PAY-O-1', status: 'REFUND_PENDING' },
      refundObligation: { amountVnd: 660000, status: 'PENDING' },
      items: [],
    })
    expect(detail).toMatchObject({
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      refundObligationVnd: 660000,
      paymentAttemptId: 'PAY-O-1',
      customerId: 'user-lan',
      shipTo: { phone: '+84*****567', district: 'District 1' },
    })
    expect(toStaffOrderDetail({}).shipTo).toBeNull()
  })
})

describe('cancellation fields', () => {
  it('maps a cancelled paid order with its pending refund', () => {
    const detail = toOrderDetail({
      orderId: 'O-1',
      status: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      cancellation: { status: 'CONFIRMED' },
      refundObligation: { amountVnd: 660000, status: 'PENDING' },
    })
    expect(detail).toMatchObject({
      status: 'CANCELLED',
      cancellation: { status: 'CONFIRMED' },
      refund: { amountVnd: 660000, status: 'PENDING' },
    })
  })

  it('reads a refunded or completed refund as completed and an unknown one as pending', () => {
    const refundOf = (status: string) =>
      toOrderDetail({ refundObligation: { amountVnd: 100, status } }).refund?.status
    expect(refundOf('COMPLETED')).toBe('COMPLETED')
    expect(refundOf('REFUNDED')).toBe('COMPLETED')
    // The order service reports a fully paid refund as DONE.
    expect(refundOf('DONE')).toBe('COMPLETED')
    expect(refundOf('SOMETHING_NEW')).toBe('PENDING')
  })

  it('maps a request waiting for the warehouse and a refused one', () => {
    expect(
      toOrderDetail({ status: 'CANCEL_REQUESTED', cancellation: { status: 'REQUESTED' } })
    ).toMatchObject({ status: 'CANCEL_REQUESTED', cancellation: { status: 'REQUESTED' } })
    expect(toOrderDetail({ cancellation: { status: 'REFUSED' } }).cancellation?.status).toBe(
      'REFUSED'
    )
  })

  it('reads the cancellation from the order status when the service sends no cancellation object', () => {
    expect(toOrderDetail({ status: 'CANCEL_REQUESTED' }).cancellation?.status).toBe('REQUESTED')
    expect(toOrderDetail({ status: 'CANCELLED' }).cancellation?.status).toBe('CONFIRMED')
    expect(toOrderDetail({ status: 'IN_FULFILLMENT' }).cancellation).toBeNull()
  })

  it('has no cancellation or refund when the service sends none, and ignores a bad status', () => {
    expect(toOrderDetail({ refundObligation: null })).toMatchObject({
      cancellation: null,
      refund: null,
    })
    expect(toOrderDetail({ cancellation: { status: 'WEIRD' } }).cancellation).toBeNull()
    expect(
      toOrderDetail({ refundObligation: { amountVnd: 0, status: 'PENDING' } }).refund
    ).toBeNull()
  })
})

describe('refund payment statuses', () => {
  it('keeps REFUNDED and PARTIALLY_REFUNDED instead of reading them as unpaid', () => {
    expect(toOrder({ paymentStatus: 'REFUNDED' }).paymentStatus).toBe('REFUNDED')
    expect(toOrder({ paymentStatus: 'PARTIALLY_REFUNDED' }).paymentStatus).toBe(
      'PARTIALLY_REFUNDED'
    )
  })
})
