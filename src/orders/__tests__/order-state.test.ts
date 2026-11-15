import { ApiError } from '@/services/api/api-error'
import type { Order } from '@/types/order'
import { describePayment, placeOrderProblem } from '../order-state'

const order = (overrides: Partial<Order> = {}): Order => ({
  orderId: 'O-001',
  status: 'RESERVED',
  paymentStatus: 'PROCESSING',
  failureCode: null,
  totalPayableVnd: 660000,
  paymentAttemptId: 'pay-O-001',
  createdAt: '2026-11-15T10:00:00.000Z',
  unknownDeadline: null,
  refundObligationVnd: 0,
  ...overrides,
})

describe('describePayment', () => {
  it('waits for the payment while the stock is reserved', () => {
    expect(describePayment(order())).toMatchObject({ tone: 'waiting', canSimulate: true })
  })

  it('tells the customer not to pay again while the result is unknown', () => {
    const view = describePayment(
      order({ status: 'UNKNOWN_HOLD', paymentStatus: 'UNKNOWN', unknownDeadline: 'x' })
    )
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
        paymentStatus: 'EXPIRED_30M',
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
        paymentStatus: 'CAPTURED_LATE',
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
