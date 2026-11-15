import { ApiError } from '@/services/api/api-error'
import type { Order, OrderStatus } from '@/types/order'
import {
  canCancelOrder,
  cancelProblem,
  describePayment,
  isPaidStatus,
  orderStatusLabel,
  placeOrderProblem,
} from '../order-state'

const order = (overrides: Partial<Order> = {}): Order => ({
  orderId: 'O-001',
  status: 'RESERVED',
  paymentStatus: 'PROCESSING',
  failureCode: null,
  totalPayableVnd: 660000,
  paymentAttemptId: 'PAY-O-001',
  createdAt: '2026-11-15T10:00:00.000Z',
  expiresAt: null,
  refundObligationVnd: 0,
  ...overrides,
})

describe('describePayment', () => {
  it('waits for the payment while the stock is reserved', () => {
    expect(describePayment(order())).toMatchObject({ tone: 'waiting', canSimulate: true })
  })

  it('tells the customer not to pay again while the result is unknown', () => {
    const view = describePayment(order({ status: 'UNKNOWN_HOLD', paymentStatus: 'UNKNOWN_30M' }))
    expect(view).toMatchObject({ tone: 'verifying', canSimulate: true })
    expect(view.body).toMatch(/do not pay again/i)
  })

  it('confirms the order after a capture', () => {
    expect(
      describePayment(order({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' }))
    ).toMatchObject({
      tone: 'success',
      canSimulate: false,
    })
  })

  it('explains a failed payment and that nothing was charged', () => {
    const view = describePayment(
      order({ status: 'FAILED_CLOSED', paymentStatus: 'FAILED', failureCode: 'PAYMENT_FAILED' })
    )
    expect(view).toMatchObject({ tone: 'failed', canSimulate: false })
    expect(view.body).toMatch(/nothing was charged/i)
  })

  it('closes the order when the unknown result was not settled in time', () => {
    const view = describePayment(
      order({
        status: 'FAILED_CLOSED',
        paymentStatus: 'UNKNOWN_30M',
        failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
      })
    )
    expect(view.tone).toBe('closed')
    // The late capture can still arrive after the window.
    expect(view.canSimulate).toBe(true)
  })

  it('says a late payment is refunded and the order is not restored', () => {
    const view = describePayment(
      order({
        status: 'FAILED_CLOSED',
        paymentStatus: 'REFUND_PENDING',
        failureCode: 'PAYMENT_UNKNOWN_EXPIRED',
        refundObligationVnd: 660000,
      })
    )
    expect(view.tone).toBe('late')
    expect(view.body).toMatch(/660\.000/)
    expect(view.body).toMatch(/not restored/i)
    expect(view.canSimulate).toBe(false)
  })
})

describe('placeOrderProblem', () => {
  const api = (code: string) => new ApiError({ kind: 'http', message: code, code, status: 409 })

  it('asks for a new quote when the quote expired', () => {
    expect(placeOrderProblem(api('QUOTE_EXPIRED'))).toMatchObject({ kind: 'new-quote' })
  })

  it('reports stock and voucher refusals as final', () => {
    expect(placeOrderProblem(api('OUT_OF_STOCK'))).toMatchObject({ kind: 'cart' })
    expect(placeOrderProblem(api('VOUCHER_EXHAUSTED'))).toMatchObject({ kind: 'new-quote' })
  })

  it('allows a retry with the same key after a dependency or network failure', () => {
    expect(placeOrderProblem(api('DEPENDENCY_UNAVAILABLE'))).toMatchObject({ kind: 'retry' })
    expect(
      placeOrderProblem(
        new ApiError({
          kind: 'network',
          message: 'Network Error',
          code: 'NETWORK_ERROR',
          status: 0,
        })
      )
    ).toMatchObject({ kind: 'retry' })
  })
})

describe('orderStatusLabel', () => {
  it('uses customer wording for every status', () => {
    expect(orderStatusLabel('RESERVED')).toBe('Awaiting payment')
    expect(orderStatusLabel('CONFIRMED')).toBe('Confirmed')
    expect(orderStatusLabel('UNKNOWN_HOLD')).toBe('Verifying payment')
    expect(orderStatusLabel('FAILED_CLOSED')).toBe('Closed')
  })
})

describe('isPaidStatus', () => {
  it('treats confirmed, in-fulfilment and delivered orders as paid and nothing else', () => {
    expect(
      ['CONFIRMED', 'IN_FULFILLMENT', 'DELIVERED'].every((s) => isPaidStatus(s as OrderStatus))
    ).toBe(true)
    expect(
      ['PENDING', 'RESERVED', 'UNKNOWN_HOLD', 'FAILED_CLOSED'].some((s) =>
        isPaidStatus(s as OrderStatus)
      )
    ).toBe(false)
  })

  it('describes an order in fulfilment as received, not as awaiting payment', () => {
    expect(describePayment({ status: 'IN_FULFILLMENT', orderId: 'O-1' } as never).tone).toBe(
      'success'
    )
  })
})

describe('cancellation wording', () => {
  it('labels the cancellation states for the customer', () => {
    expect(orderStatusLabel('CANCEL_REQUESTED')).toBe('Awaiting warehouse confirmation')
    expect(orderStatusLabel('CANCELLED')).toBe('Cancelled')
  })

  it('offers cancel until the parcel leaves, never while payment is unknown or after closing', () => {
    expect(
      (['RESERVED', 'CONFIRMED', 'IN_FULFILLMENT'] as const).every((status) =>
        canCancelOrder(status)
      )
    ).toBe(true)
    expect(
      (
        [
          'PENDING',
          'UNKNOWN_HOLD',
          'CANCEL_REQUESTED',
          'CANCELLED',
          'DELIVERED',
          'FAILED_CLOSED',
        ] as const
      ).some((status) => canCancelOrder(status))
    ).toBe(false)
  })

  it('tells a waiting customer the order is not cancelled yet', () => {
    const view = describePayment(order({ status: 'CANCEL_REQUESTED', paymentStatus: 'CAPTURED' }))
    expect(view).toMatchObject({ tone: 'waiting', isPending: true, canSimulate: false })
    expect(view.title).toBe('Awaiting warehouse confirmation')
    expect(view.body).toMatch(/not cancelled yet/i)
  })

  it('shows a cancelled order as closed, also when money is being refunded', () => {
    expect(describePayment(order({ status: 'CANCELLED' }))).toMatchObject({
      tone: 'closed',
      title: 'Order cancelled',
      isPending: false,
    })
    expect(
      describePayment(order({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' })).title
    ).toBe('Order cancelled')
  })

  it.each([
    ['ORDER_ALREADY_HANDED_OVER', /handed to the carrier.*return/i],
    ['PAYMENT_UNRESOLVED', /verifying your payment/i],
    ['ORDER_NOT_CANCELLABLE', /can no longer be cancelled/i],
    ['SOMETHING_ELSE', /could not confirm.*safe to try again/i],
  ])('explains %s without leaking the raw error', (code, pattern) => {
    const error = new ApiError({ kind: 'http', status: 409, code, message: 'internal detail' })
    const message = cancelProblem(error)
    expect(message).toMatch(pattern)
    expect(message).not.toMatch(/internal detail/)
  })
})
