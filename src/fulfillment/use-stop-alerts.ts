'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessToken } from '@/auth/access-token'
import type { StopAlert, StopResolution } from '@/types/cancellation'
import { applyStreamEvent } from './stop-alert-state'
import { startAlertStream, stopAlertStreamUrl, type StreamStatus } from './stop-alert-stream'

/** Overall state of the streams: live only when every warehouse's stream is. */
function combine(statuses: Record<string, StreamStatus>): StreamStatus {
  const values = Object.values(statuses)
  if (values.includes('reconnecting')) return 'reconnecting'
  if (values.includes('connecting')) return 'connecting'
  return 'live'
}

/**
 * The open stop-packing alerts of the given warehouses, kept live over one event stream per warehouse. An alert stays in
 * the list until it is resolved (by the service, or by this person's confirmation): a dropped connection never removes it.
 */
export function useStopAlerts(warehouseIds: readonly string[]) {
  const key = warehouseIds.join(',')
  const alertsRef = useRef<StopAlert[]>([])
  const [alerts, setAlerts] = useState<StopAlert[]>([])
  const [resolutions, setResolutions] = useState<StopResolution[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')

  const addResolution = useCallback((resolution: StopResolution) => {
    setResolutions((current) => [
      ...current.filter((entry) => entry.orderId !== resolution.orderId),
      resolution,
    ])
  }, [])

  useEffect(() => {
    const ids = key ? key.split(',') : []
    const statuses: Record<string, StreamStatus> = {}
    const stops = ids.map((warehouseId) =>
      startAlertStream({
        url: stopAlertStreamUrl(warehouseId),
        getToken: getAccessToken,
        onStatus: (next) => {
          statuses[warehouseId] = next
          setStatus(combine(statuses))
        },
        onEvent: (message) => {
          const result = applyStreamEvent(alertsRef.current, message)
          alertsRef.current = result.alerts
          setAlerts(result.alerts)
          if (result.resolution) addResolution(result.resolution)
        },
      })
    )
    if (ids.length === 0) setStatus('live')
    return () => stops.forEach((stop) => stop())
  }, [key, addResolution])

  /** This person's own confirmation (or the refusal it ran into) resolves the alert at once. */
  const resolveHere = useCallback(
    (resolution: StopResolution) => {
      alertsRef.current = alertsRef.current.filter(
        (entry) => entry.shipmentId !== resolution.shipmentId
      )
      setAlerts(alertsRef.current)
      addResolution(resolution)
    },
    [addResolution]
  )

  const dismiss = useCallback(
    (orderId: string) =>
      setResolutions((current) => current.filter((entry) => entry.orderId !== orderId)),
    []
  )

  return { alerts, resolutions, status, resolveHere, dismiss }
}
