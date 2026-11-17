import { storefrontApi } from '@/services/api/clients'
import type { OrderStatus, StaffOrderDetail } from '@/types/order'
import { toStaffOrderDetail, toStaffOrderRow } from './adapters'

// Backoffice order read APIs (P5-T10), for staff with an order role.
export const STAFF_ORDERS_KEY = ['staff-orders'] as const
export const staffOrderKey = (orderId: string) => ['staff-order', orderId] as const

export interface StaffOrderQuery {
  status: OrderStatus | ''
  page: number
  limit: number
}

export async function listStaffOrders(query: StaffOrderQuery) {
  const { data, metadata } = await storefrontApi.get<unknown[]>('/admin/orders', {
    params: {
      ...(query.status && { status: query.status }),
      page: query.page,
      limit: query.limit,
    },
  })
  return {
    items: (data ?? []).map(toStaffOrderRow),
    total: metadata?.total ?? data?.length ?? 0,
    pageCount: metadata?.pageCount ?? 1,
  }
}

export async function getStaffOrder(orderId: string): Promise<StaffOrderDetail> {
  const { data } = await storefrontApi.get<unknown>(`/admin/orders/${encodeURIComponent(orderId)}`)
  return toStaffOrderDetail(data)
}
