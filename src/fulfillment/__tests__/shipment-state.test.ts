import { ApiError } from '@/services/api/api-error'
import { isFullyPicked, isPickable, isStaleVersion, shipmentProblem } from '../shipment-state'

const apiError = (code: string) => new ApiError({ kind: 'http', status: 422, code, message: 'x' })

describe('shipment state', () => {
  it('is pickable only before packing', () => {
    expect(isPickable({ status: 'PENDING_PICK' })).toBe(true)
    expect(isPickable({ status: 'PICKING' })).toBe(true)
    expect(isPickable({ status: 'PACKED' })).toBe(false)
    expect(isPickable({ status: 'PICK_BLOCKED' })).toBe(false)
  })

  it('is fully picked when every line reached its ordered quantity', () => {
    const line = (picked: number) => ({
      skuId: 'A',
      skuName: 'A',
      orderedQuantity: 2,
      pickedQuantity: picked,
    })
    expect(isFullyPicked({ lines: [line(2), line(2)] })).toBe(true)
    expect(isFullyPicked({ lines: [line(2), line(1)] })).toBe(false)
    expect(isFullyPicked({ lines: [] })).toBe(false)
  })

  it('words known refusals and falls back for anything else', () => {
    expect(shipmentProblem(apiError('SKU_NOT_ON_PICK_LIST'))).toMatch(/not on this pick list/)
    expect(shipmentProblem(apiError('QUANTITY_EXCEEDS_ORDER'))).toMatch(/more than the order/)
    expect(shipmentProblem(new Error('boom'))).toMatch(/could not save/)
  })

  it('recognises a stale version', () => {
    expect(isStaleVersion(apiError('STALE_VERSION'))).toBe(true)
    expect(isStaleVersion(apiError('OTHER'))).toBe(false)
  })
})
