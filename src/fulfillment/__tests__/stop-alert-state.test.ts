import type { StopAlert } from '@/types/cancellation'
import { applyStreamEvent, toStopAlert, toStopResolution } from '../stop-alert-state'

const alert = (orderId: string, warehouseId = 'WH-HCM-01'): StopAlert => ({
  orderId,
  shipmentId: `SHP-${orderId}`,
  warehouseId,
  requestedAt: '2026-11-15T10:00:00.000Z',
})

describe('stop alert adapters', () => {
  it('reads an alert and derives the shipment id the service leaves out', () => {
    expect(
      toStopAlert(
        '{"orderId":"O-5","warehouseId":"WH-HCM-01","requestedAt":"2026-11-15T10:00:00.000Z"}'
      )
    ).toEqual(alert('O-5'))
  })

  it('refuses an alert without an order and a warehouse, or with broken JSON', () => {
    expect(toStopAlert('{"warehouseId":"WH-HCM-01"}')).toBeNull()
    expect(toStopAlert('{"orderId":"O-5"}')).toBeNull()
    expect(toStopAlert('nope')).toBeNull()
  })

  it('reads a resolution and only knows two outcomes', () => {
    expect(toStopResolution('{"orderId":"O-5","outcome":"STOPPED"}')).toEqual({
      orderId: 'O-5',
      shipmentId: 'SHP-O-5',
      outcome: 'STOPPED',
    })
    expect(toStopResolution('{"orderId":"O-5","outcome":"HANDED_OVER"}')?.outcome).toBe(
      'HANDED_OVER'
    )
    expect(toStopResolution('{"orderId":"O-5","outcome":"WHATEVER"}')).toBeNull()
  })
})

describe('applyStreamEvent', () => {
  it('adds an alert once, however often the service sends it (a reconnect replays open alerts)', () => {
    const data = JSON.stringify(alert('O-5'))
    const once = applyStreamEvent([], { event: 'stop_requested', data })
    const twice = applyStreamEvent(once.alerts, { event: 'stop_requested', data })
    expect(twice.alerts).toEqual([alert('O-5')])
  })

  it('removes an alert only when the service says it was resolved, and reports how', () => {
    const start = [alert('O-5'), alert('O-7')]
    const result = applyStreamEvent(start, {
      event: 'stop_resolved',
      data: '{"orderId":"O-5","outcome":"HANDED_OVER"}',
    })
    expect(result.alerts).toEqual([alert('O-7')])
    expect(result.resolution).toMatchObject({ orderId: 'O-5', outcome: 'HANDED_OVER' })
    expect(start).toHaveLength(2)
  })

  it('keeps every alert for other events, heartbeats and bad data', () => {
    const start = [alert('O-5')]
    for (const event of [
      { event: 'connected', data: '{}' },
      { event: 'stop_requested', data: 'garbage' },
      { event: 'stop_resolved', data: '{}' },
      { event: 'unknown', data: '1' },
    ])
      expect(applyStreamEvent(start, event).alerts).toEqual(start)
  })
})
