import { unstable_noStore as noStore } from 'next/cache'
import { handleMockApi } from '@/auth/mock-api'
import { isMockModeAllowed } from '@/auth/mock-guard'
import type { CategoryNode } from '@/types/catalog'
import { normalizeTree } from './adapters'

/** Seconds a fetched catalogue response may be reused by the server (P2-T10). */
export const CATALOG_REVALIDATE_SECONDS = 300

/** A failed server-side GET; `status` is the HTTP status (404 for a missing resource). */
export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    path: string
  ) {
    super(`GET ${path} failed with ${status}`)
    this.name = 'ServerApiError'
  }
}

/**
 * GET from server components. In mock mode the in-app mock backend is called directly (no HTTP, never cached,
 * so edits made in the backoffice show up at once); otherwise the storefront API is fetched and cached.
 */
export async function serverGet<T>(path: string, query?: Record<string, string>): Promise<T> {
  if (isMockModeAllowed()) {
    const result = handleMockApi({ method: 'GET', path, query })
    if (result.status !== 200) throw new ServerApiError(result.status, path)
    return (result.body as { data: T }).data
  }

  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!base) throw new Error('API base URL is not configured')
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  const response = await fetch(`${base}${path}${search}`, {
    next: { revalidate: CATALOG_REVALIDATE_SECONDS },
  })
  if (!response.ok) throw new ServerApiError(response.status, path)
  return ((await response.json()) as { data: T }).data
}

/** Call before a try/catch around serverGet: noStore() works by throwing, which a catch must not swallow. */
export function optOutOfCachingInMockMode(): void {
  if (isMockModeAllowed()) noStore()
}

export const fetchCategoryTree = async () =>
  normalizeTree(await serverGet<CategoryNode[]>('/categories'))

/** The category tree, or null when it cannot be loaded (callers show a fallback). */
export async function fetchCategoryTreeOrNull(): Promise<CategoryNode[] | null> {
  optOutOfCachingInMockMode()
  return fetchCategoryTree().catch(() => null)
}
