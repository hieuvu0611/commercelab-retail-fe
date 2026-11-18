import { storefrontApi } from '@/services/api/clients'
import type { ShipmentDetail, ShipmentStatus } from '@/types/fulfillment'
import { toShipmentDetail, toShipmentRow } from './adapters'

// Warehouse shipment calls (P6-T02/T03/T05, as the service answers): the queue, the pick list and the actions on it. The
// service limits everything to the caller's warehouses and refuses a change made on an old `version`.
export const SHIPMENTS_KEY = ['staff-shipments'] as const
export const shipmentKey = (shipmentId: string) => ['staff-shipment', shipmentId] as const

const path = (shipmentId: string, action = '') =>
  `/admin/shipments/${encodeURIComponent(shipmentId)}${action}`

export interface ShipmentQuery {
  status: ShipmentStatus | ''
  page: number
  limit: number
}

export async function listShipments(query: ShipmentQuery) {
  const { data, metadata } = await storefrontApi.get<unknown[]>('/admin/shipments', {
    params: {
      ...(query.status && { status: query.status }),
      page: query.page,
      limit: query.limit,
    },
  })
  return {
    items: (data ?? []).map(toShipmentRow),
    total: metadata?.total ?? data?.length ?? 0,
    pageCount: metadata?.pageCount ?? 1,
  }
}

export async function listOrderShipments(orderId: string) {
  const { data } = await storefrontApi.get<unknown[]>(
    `/admin/orders/${encodeURIComponent(orderId)}/shipments`
  )
  return (data ?? []).map(toShipmentRow)
}

export async function getShipment(shipmentId: string): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.get<unknown>(path(shipmentId))
  return toShipmentDetail(data)
}

// Actions skip the global 401 sign-out so the screen can explain a refusal.
const quiet = { skipUnauthorizedHandler: true } as const

export async function scanSku(
  shipmentId: string,
  input: { skuId: string; quantity: number; version: number }
): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(path(shipmentId, '/scan'), input, quiet)
  return toShipmentDetail(data)
}

export async function packShipment(shipmentId: string, version: number): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(path(shipmentId, '/pack'), { version }, quiet)
  return toShipmentDetail(data)
}

export async function handOverShipment(
  shipmentId: string,
  version: number
): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(
    path(shipmentId, '/handover'),
    { version },
    quiet
  )
  return toShipmentDetail(data)
}

export async function reportShortage(
  shipmentId: string,
  input: { skuId: string; quantity: number; reason: string; version: number }
): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(
    path(shipmentId, '/report-shortage'),
    input,
    quiet
  )
  return toShipmentDetail(data)
}

/**
 * Confirms that packing has stopped for a cancelled order (P7-T02, SC06): the stock is released and the shipment can never
 * be handed over. Reads the shipment's current version first; the service refuses with 409 when the handover came first.
 */
export async function confirmStop(shipmentId: string): Promise<ShipmentDetail> {
  const current = await getShipment(shipmentId)
  const { data } = await storefrontApi.post<unknown>(
    path(shipmentId, '/confirm-stop'),
    { version: current.version },
    quiet
  )
  return toShipmentDetail(data)
}

/** Confirms parcel delivery (and carrier COD collection for COD shipments) at the shipment level. */
export async function deliverShipment(
  shipmentId: string,
  version: number
): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(
    path(shipmentId, '/deliver'),
    { version },
    quiet
  )
  return toShipmentDetail(data)
}

/** Records a failed parcel delivery / RTS at the shipment level; COD cancellation is coordinated across parcels by BE. */
export async function failShipmentDelivery(
  shipmentId: string,
  version: number,
  reason = 'Carrier delivery failed or customer rejected parcel'
): Promise<ShipmentDetail> {
  const { data } = await storefrontApi.post<unknown>(
    path(shipmentId, '/delivery-failed'),
    { version, reason },
    quiet
  )
  return toShipmentDetail(data)
}
