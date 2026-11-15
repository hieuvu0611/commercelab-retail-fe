import { storefrontApi } from '@/services/api/clients'
import type { CategoryNode } from '@/types/catalog'
import { categoriesFromList, slugify } from './adapters'

// Backoffice catalogue calls (PRODUCT_STAFF). Mutations skip the global 401 sign-out so a form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const

/** GET /admin/categories: every category including inactive ones, returned as a tree. */
export const listAdminCategories = async () =>
  categoriesFromList((await storefrontApi.get<CategoryNode[]>('/admin/categories')).data)

export const createCategory = (input: { name: string; parentId: string | null }) =>
  storefrontApi.post<CategoryNode>(
    '/admin/categories',
    { ...input, slug: slugify(input.name) },
    quiet
  )

export const renameCategory = (id: string, name: string) =>
  storefrontApi.patch<CategoryNode>(`/admin/categories/${id}`, { name }, quiet)

export const setCategoryActive = (id: string, isActive: boolean) =>
  storefrontApi.patch<CategoryNode>(`/admin/categories/${id}`, { isActive }, quiet)

export const moveCategory = (id: string, parentId: string | null) =>
  storefrontApi.post<CategoryNode>(`/admin/categories/${id}/move`, { parentId }, quiet)

export const deleteCategory = (id: string) =>
  storefrontApi.delete<unknown>(`/admin/categories/${id}`, quiet)
