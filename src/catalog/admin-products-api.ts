import { storefrontApi } from '@/services/api/clients'
import type {
  AdminProductSummary,
  Product,
  ProductPatch,
  ProductStatus,
  UploadUrl,
} from '@/types/catalog'

// Backoffice product calls (PRODUCT_STAFF). Every mutation sends the version the editor loaded (optimistic
// concurrency, 409 VERSION_CONFLICT) and skips the global 401 sign-out so the form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const
const base = (id: string) => `/admin/products/${id}`

export interface AdminProductQuery {
  q?: string
  status?: ProductStatus
  page: number
  limit: number
}

export async function listAdminProducts(query: AdminProductQuery) {
  const { data, metadata } = await storefrontApi.get<AdminProductSummary[]>('/admin/products', {
    params: {
      ...(query.q && { q: query.q }),
      ...(query.status && { status: query.status }),
      page: query.page,
      limit: query.limit,
    },
  })
  return { items: data, total: metadata?.total ?? data.length, pageCount: metadata?.pageCount ?? 1 }
}

export const getAdminProduct = async (id: string) =>
  (await storefrontApi.get<Product>(base(id))).data

export const createAdminProduct = async (name: string) =>
  (await storefrontApi.post<Product>('/admin/products', { name }, quiet)).data

export const patchAdminProduct = async (id: string, patch: ProductPatch) =>
  (await storefrontApi.patch<Product>(base(id), patch, quiet)).data

export const addSku = async (
  id: string,
  version: number,
  sku: { skuId: string; attributes: Record<string, string> }
) => (await storefrontApi.post<Product>(`${base(id)}/skus`, { ...sku, version }, quiet)).data

export const setSkuActive = async (id: string, version: number, skuId: string, isActive: boolean) =>
  (
    await storefrontApi.patch<Product>(
      `${base(id)}/skus/${encodeURIComponent(skuId)}`,
      { isActive, version },
      quiet
    )
  ).data

export const removeSku = async (id: string, version: number, skuId: string) =>
  (
    await storefrontApi.delete<Product>(`${base(id)}/skus/${encodeURIComponent(skuId)}`, {
      ...quiet,
      params: { version },
    })
  ).data

/** Step 1 of an image upload: ask for a presigned PUT URL. */
export const requestUploadUrl = async (
  id: string,
  file: { name: string; type: string; size: number }
) =>
  (
    await storefrontApi.post<UploadUrl>(
      `${base(id)}/images/upload-url`,
      { fileName: file.name, contentType: file.type, size: file.size },
      quiet
    )
  ).data

/** Step 2: send the bytes straight to storage. A presigned URL carries its own authorisation, so no bearer token. */
export async function uploadToPresignedUrl(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!response.ok) throw new Error(`Upload failed with ${response.status}`)
}

/** Step 3: attach the uploaded object to the product. */
export const attachImage = async (id: string, version: number, upload: UploadUrl, alt?: string) =>
  (
    await storefrontApi.post<Product>(
      `${base(id)}/images`,
      { objectKey: upload.objectKey, publicUrl: upload.publicUrl, alt, version },
      quiet
    )
  ).data

export const reorderImages = async (id: string, version: number, imageIds: string[]) =>
  (await storefrontApi.put<Product>(`${base(id)}/images/order`, { imageIds, version }, quiet)).data

export const removeImage = async (id: string, version: number, imageId: string) =>
  (
    await storefrontApi.delete<Product>(`${base(id)}/images/${imageId}`, {
      ...quiet,
      params: { version },
    })
  ).data

export type WorkflowAction = 'submit-review' | 'publish' | 'reject' | 'unpublish'

export const runWorkflow = async (
  id: string,
  version: number,
  action: WorkflowAction,
  reason?: string
) =>
  (
    await storefrontApi.post<Product>(
      `${base(id)}/${action}`,
      { version, ...(reason && { reason }) },
      quiet
    )
  ).data
