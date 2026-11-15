import { toOrder, toOrderDetail, toOrderSummary } from '../adapters'

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
