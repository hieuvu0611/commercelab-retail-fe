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
      paymentStatus: 'UNKNOWN',
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
      totalPayableVnd: 660000,
      createdAt: '2026-11-15T10:00:00.000Z',
      itemCount: 3,
    })
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
      address: {
        recipient: 'Lan',
        phone: '+84901234567',
        line1: 'x',
        ward: 'w',
        district: 'd',
        province: 'p',
      },
      lines: [
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
  it('maps a list row with the masked customer name', () => {
    expect(
      toStaffOrderRow({
        orderId: 'O-1',
        status: 'UNKNOWN_HOLD',
        paymentStatus: 'UNKNOWN',
        totalPayableVnd: 660000,
        createdAt: '2026-11-15T10:00:00.000Z',
        itemCount: 3,
        customerName: 'Lan N.',
      })
    ).toMatchObject({
      orderId: 'O-1',
      status: 'UNKNOWN_HOLD',
      customerName: 'Lan N.',
      itemCount: 3,
    })
  })

  it('maps the detail with the minimal delivery information and payment facts', () => {
    const detail = toStaffOrderDetail({
      orderId: 'O-1',
      status: 'FAILED_CLOSED',
      paymentStatus: 'CAPTURED_LATE',
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      refundObligationVnd: 660000,
      totalPayableVnd: 660000,
      customerName: 'Lan N.',
      shipTo: {
        recipient: 'Lan N.',
        phone: '+84*****567',
        district: 'District 1',
        province: 'HCMC',
      },
      lines: [],
    })
    expect(detail).toMatchObject({
      failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      refundObligationVnd: 660000,
      customerName: 'Lan N.',
      shipTo: { phone: '+84*****567', district: 'District 1' },
    })
    expect(toStaffOrderDetail({}).shipTo).toBeNull()
  })
})
