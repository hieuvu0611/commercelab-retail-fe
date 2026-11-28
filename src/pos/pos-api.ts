import { getAccessToken } from '@/auth/access-token'
import { createMockPosSale, listMockPosSales, searchMockPosCatalog } from './mock-pos'
import {
  PosApiError,
  type CreatePosSaleRequest,
  type PosCatalogItem,
  type PosSaleReceipt,
  type PosSaleSummary,
} from './types'

export { PosApiError } from './types'

export const POS_SALES_KEY = (warehouseId?: string) => ['pos-sales', warehouseId ?? 'all'] as const
export const POS_CATALOG_KEY = (query: string) => ['pos-catalog', query] as const

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  if (configured) {
    const trimmed = configured.replace(/\/+$/, '')
    return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
  }
  return '/api/v1'
}

function buildHeaders(
  accessToken?: string,
  extra?: Record<string, string>
): Record<string, string> {
  const token = accessToken ?? getAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function parseErrorResponse(response: Response): Promise<PosApiError> {
  let code = `HTTP_${response.status}`
  let message = `Request failed with status ${response.status}`
  try {
    const payload = (await response.json()) as {
      code?: unknown
      message?: unknown
      detail?: unknown
      error?: { code?: unknown; message?: unknown }
    }
    if (typeof payload.code === 'string' && payload.code.length > 0) {
      code = payload.code
    } else if (typeof payload.error?.code === 'string' && payload.error.code.length > 0) {
      code = payload.error.code
    }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      message = payload.message
    } else if (typeof payload.detail === 'string' && payload.detail.length > 0) {
      message = payload.detail
    } else if (typeof payload.error?.message === 'string' && payload.error.message.length > 0) {
      message = payload.error.message
    }
  } catch {
  }
  return new PosApiError(response.status, code, message)
}

export async function createPosSale(
  req: CreatePosSaleRequest,
  idempotencyKey: string,
  accessToken?: string
): Promise<PosSaleReceipt> {
  if (isMockMode()) {
    return createMockPosSale(req, idempotencyKey)
  }

  const response = await fetch(`${apiBaseUrl()}/admin/pos/sales`, {
    method: 'POST',
    headers: buildHeaders(accessToken, { 'Idempotency-Key': idempotencyKey }),
    body: JSON.stringify(req),
  })

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const body = (await response.json()) as { data?: PosSaleReceipt } | PosSaleReceipt
  if (body && typeof body === 'object' && 'data' in body && body.data) {
    return body.data
  }
  return body as PosSaleReceipt
}

export async function listPosSales(
  warehouseId?: string,
  accessToken?: string
): Promise<PosSaleSummary[]> {
  if (isMockMode()) {
    return listMockPosSales(warehouseId)
  }

  const params = new URLSearchParams()
  if (warehouseId) params.set('warehouseId', warehouseId)
  const queryString = params.toString()
  const url = `${apiBaseUrl()}/admin/pos/sales${queryString ? `?${queryString}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const body = (await response.json()) as
    | { data?: PosSaleSummary[] | { items?: PosSaleSummary[] } }
    | PosSaleSummary[]
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data)) return body.data
  if (body?.data && typeof body.data === 'object' && Array.isArray(body.data.items)) {
    return body.data.items
  }
  return []
}

interface RawCatalogEntry {
  skuId?: string
  id?: string
  slug?: string
  name?: string
  productName?: string
  unitPriceVnd?: number | null
  minPriceVnd?: number | null
  skus?: Array<{
    skuId?: string
    unitPriceVnd?: number | null
    isActive?: boolean
  }>
}

function normalizeCatalogEntries(entries: RawCatalogEntry[]): PosCatalogItem[] {
  const result: PosCatalogItem[] = []
  for (const entry of entries) {
    if (Array.isArray(entry.skus) && entry.skus.length > 0) {
      for (const sku of entry.skus) {
        if (!sku.skuId || sku.isActive === false || typeof sku.unitPriceVnd !== 'number') continue
        result.push({
          skuId: sku.skuId,
          name: entry.name ?? entry.productName ?? sku.skuId,
          unitPriceVnd: sku.unitPriceVnd,
        })
      }
      continue
    }

    const skuId = entry.skuId ?? entry.slug ?? entry.id
    const price = entry.unitPriceVnd ?? entry.minPriceVnd
    if (skuId && typeof price === 'number') {
      result.push({
        skuId,
        name: entry.name ?? entry.productName ?? skuId,
        unitPriceVnd: price,
      })
    }
  }
  return result
}

export async function searchPosCatalog(
  query: string,
  accessToken?: string
): Promise<PosCatalogItem[]> {
  if (isMockMode()) {
    return searchMockPosCatalog(query)
  }

  const params = new URLSearchParams({ limit: '12' })
  if (query.trim()) params.set('q', query.trim())

  const response = await fetch(`${apiBaseUrl()}/products?${params.toString()}`, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const body = (await response.json()) as { data?: RawCatalogEntry[] } | RawCatalogEntry[]
  const rawList = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  return normalizeCatalogEntries(rawList)
}
