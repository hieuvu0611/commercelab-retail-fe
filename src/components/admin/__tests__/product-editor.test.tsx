import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockCatalogState, nestCategories } from '@/catalog/mock-catalog'
import { seedProducts } from '@/catalog/mock-products'
import { ApiError } from '@/services/api/api-error'

const api = {
  getAdminProduct: jest.fn(),
  patchAdminProduct: jest.fn(),
  runWorkflow: jest.fn(),
  requestUploadUrl: jest.fn(),
  uploadToPresignedUrl: jest.fn(),
  attachImage: jest.fn(),
  addSku: jest.fn(),
}
let sessionState: { data: unknown; status: string }

jest.mock('next-auth/react', () => ({ useSession: () => sessionState }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}))
jest.mock('@/catalog/admin-api', () => ({
  listAdminCategories: async () => nestCategories(createMockCatalogState().categories, null, true),
}))
jest.mock('@/catalog/admin-products-api', () => ({
  getAdminProduct: (...a: unknown[]) => api.getAdminProduct(...a),
  patchAdminProduct: (...a: unknown[]) => api.patchAdminProduct(...a),
  runWorkflow: (...a: unknown[]) => api.runWorkflow(...a),
  requestUploadUrl: (...a: unknown[]) => api.requestUploadUrl(...a),
  uploadToPresignedUrl: (...a: unknown[]) => api.uploadToPresignedUrl(...a),
  attachImage: (...a: unknown[]) => api.attachImage(...a),
  addSku: (...a: unknown[]) => api.addSku(...a),
}))

import { ProductEditor } from '../product-editor'

const STAFF = {
  user: { id: 's', name: 'P', email: 'p@x.vn', roles: ['PRODUCT_STAFF'], warehouseScopes: [] },
}
const draft = seedProducts().find((p) => p.slug === 'canvas-tote-draft')!

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProductEditor productId={draft.id} />
    </QueryClientProvider>
  )
}

const httpError = (status: number, code: string, fieldErrors: Record<string, string[]> = {}) =>
  new ApiError({ kind: 'http', status, code, message: code, fieldErrors })

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset())
  api.getAdminProduct.mockResolvedValue(draft)
  sessionState = { data: STAFF, status: 'authenticated' }
})

describe('ProductEditor', () => {
  it('saves general information with the loaded version', async () => {
    const user = userEvent.setup()
    api.patchAdminProduct.mockResolvedValue({ ...draft, name: 'Canvas Tote', version: 2 })
    renderEditor()
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Canvas Tote')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('General information saved.')).toBeInTheDocument()
    expect(api.patchAdminProduct).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ version: 1, name: 'Canvas Tote' })
    )
  })

  it('explains a version conflict and offers to reload', async () => {
    const user = userEvent.setup()
    api.patchAdminProduct.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'))
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this product')
    expect(screen.getByRole('button', { name: 'Reload the product' })).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    renderEditor()
    const general = await screen.findByRole('tab', { name: 'General' })
    general.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveFocus()
  })

  it('shows every publish problem inline on the Status tab', async () => {
    const user = userEvent.setup()
    api.getAdminProduct.mockResolvedValue({ ...draft, status: 'IN_REVIEW' })
    api.runWorkflow.mockRejectedValue(
      httpError(422, 'PUBLISH_VALIDATION_FAILED', {
        images: ['Add at least one image'],
        skus: ['SKU TOTE-1 has no active price'],
      })
    )
    renderEditor()
    await user.click(await screen.findByRole('tab', { name: 'Status' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    const alert = await screen.findByText('This product cannot be published yet. Fix these first:')
    expect(alert.closest('[role=alert]')).toHaveTextContent('Add at least one image')
    expect(alert.closest('[role=alert]')).toHaveTextContent('SKU TOTE-1 has no active price')
  })

  it('locks editing while the product is in review', async () => {
    api.getAdminProduct.mockResolvedValue({ ...draft, status: 'IN_REVIEW' })
    renderEditor()
    expect(await screen.findByText(/in review and cannot be edited/)).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeDisabled()
  })

  it('refuses a wrong image type before uploading and uploads a valid one in three steps', async () => {
    const user = userEvent.setup({ applyAccept: false })
    api.requestUploadUrl.mockResolvedValue({
      uploadUrl: '/up',
      objectKey: 'products/x/a',
      publicUrl: 'data:x',
    })
    api.uploadToPresignedUrl.mockResolvedValue(undefined)
    api.attachImage.mockResolvedValue({ ...draft, version: 2 })
    renderEditor()
    await user.click(await screen.findByRole('tab', { name: 'Images' }))
    const input = screen.getByLabelText('Add an image')

    await user.upload(input, new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a JPEG, PNG or WebP image.')
    expect(api.requestUploadUrl).not.toHaveBeenCalled()

    await user.upload(input, new File(['x'], 'front.png', { type: 'image/png' }))
    await waitFor(() => expect(api.attachImage).toHaveBeenCalled())
    expect(api.uploadToPresignedUrl).toHaveBeenCalledWith('/up', expect.any(File))
    expect(await screen.findByText('Image added.')).toBeInTheDocument()
  })

  it('shows the SKU code conflict next to the field', async () => {
    const user = userEvent.setup()
    api.addSku.mockRejectedValue(
      httpError(409, 'SKU_CODE_CONFLICT', { skuId: ['This SKU code is already used'] })
    )
    renderEditor()
    await user.click(await screen.findByRole('tab', { name: 'Variants' }))
    await user.type(screen.getByLabelText('SKU code'), 'DUP')
    await user.click(screen.getByRole('button', { name: 'Add SKU' }))
    expect(await screen.findByText('This SKU code is already used')).toBeInTheDocument()
  })
})
