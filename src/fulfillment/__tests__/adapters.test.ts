import { toOrderTracking } from '../adapters'

describe('toOrderTracking', () => {
  it('sorts events oldest first and takes the status from the latest one', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      status: 'PACKING',
      events: [
        { time: '2026-11-16T09:00:00Z', label: 'On its way', status: 'IN_TRANSIT' },
        { time: '2026-11-15T10:00:00Z', label: 'Order confirmed', status: 'CONFIRMED' },
      ],
    })
    expect(tracking.events.map((event) => event.status)).toEqual(['CONFIRMED', 'IN_TRANSIT'])
    expect(tracking.status).toBe('IN_TRANSIT')
  })

  it('reads the failure reason and the return window end', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      returnWindowEndsAt: '2026-11-23T10:00:00Z',
      events: [
        {
          occurredAt: '2026-11-16T09:00:00Z',
          status: 'DELIVERY_FAILED',
          reason: 'Recipient not available',
        },
      ],
    })
    expect(tracking.events[0]).toMatchObject({
      time: '2026-11-16T09:00:00Z',
      reason: 'Recipient not available',
      label: '',
    })
    expect(tracking.returnWindowEndsAt).toBe('2026-11-23T10:00:00Z')
  })

  it('drops events it cannot read and falls back to the confirmed status', () => {
    const tracking = toOrderTracking({
      orderId: 'O-001',
      returnWindowEndsAt: 'soon',
      events: [
        { time: 'later', status: 'DELIVERED' },
        { time: '2026-11-15T10:00:00Z', status: 'LOST' },
        null,
      ],
    })
    expect(tracking.events).toEqual([])
    expect(tracking.status).toBe('CONFIRMED')
    expect(tracking.returnWindowEndsAt).toBeNull()
  })

  it('survives a response that is not an object', () => {
    expect(toOrderTracking(null)).toMatchObject({ orderId: '', events: [], carrier: null })
  })
})
