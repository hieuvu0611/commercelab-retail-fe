import { unstable_noStore as noStore } from 'next/cache'
import { handleMockApi } from '@/auth/mock-api'
import { isMockModeAllowed } from '@/auth/mock-guard'
import type { CategoryNode } from '@/types/catalog'

/** Seconds a fetched catalogue response may be reused by the server (P2-T10). */
export const CATALOG_REVALIDATE_SECONDS = 300

/**
 * GET from server components. In mock mode the in-app mock backend is called directly (no HTTP, never cached,
 * so edits made in the backoffice show up at once); otherwise the storefront API is fetched and cached.
 */
export async function serverGet<T>(path: string, query?: Record<string, string>): Promise<T> {
  if (isMockModeAllowed()) {
    const result = handleMockApi({ method: 'GET', path, query })
    if (result.status !== 200) throw new Error(`GET ${path} failed with ${result.status}`)
    return (result.body as { data: T }).data
  }

  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!base) throw new Error('API base URL is not configured')
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  const response = await fetch(`${base}${path}${search}`, {
    next: { revalidate: CATALOG_REVALIDATE_SECONDS },
  })
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`)
  return ((await response.json()) as { data: T }).data
}

/** Call before a try/catch around serverGet: noStore() works by throwing, which a catch must not swallow. */
export function optOutOfCachingInMockMode(): void {
  if (isMockModeAllowed()) noStore()
}

export const fetchCategoryTree = () => serverGet<CategoryNode[]>('/categories')

/** The category tree, or null when it cannot be loaded (callers show a fallback). */
export async function fetchCategoryTreeOrNull(): Promise<CategoryNode[] | null> {
  optOutOfCachingInMockMode()
  return fetchCategoryTree().catch(() => null)
}
