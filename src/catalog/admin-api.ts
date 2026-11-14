import { storefrontApi } from '@/services/api/clients'
import type { CategoryNode } from '@/types/catalog'

// Backoffice catalogue calls (PRODUCT_STAFF). Mutations skip the global 401 sign-out so a form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const

/** GET /admin/categories: the whole tree including inactive categories (assumed endpoint, see P2-T17). */
export const listAdminCategories = async () =>
  (await storefrontApi.get<CategoryNode[]>('/admin/categories')).data

export const createCategory = (input: { name: string; parentId: string | null }) =>
  storefrontApi.post<CategoryNode>('/admin/categories', input, quiet)

export const renameCategory = (id: string, name: string) =>
  storefrontApi.patch<CategoryNode>(`/admin/categories/${id}`, { name }, quiet)

export const setCategoryActive = (id: string, isActive: boolean) =>
  storefrontApi.patch<CategoryNode>(`/admin/categories/${id}`, { isActive }, quiet)

export const moveCategory = (id: string, parentId: string | null) =>
  storefrontApi.post<CategoryNode>(`/admin/categories/${id}/move`, { parentId }, quiet)

export const deleteCategory = (id: string) =>
  storefrontApi.delete<unknown>(`/admin/categories/${id}`, quiet)
