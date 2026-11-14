'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState, type TextareaHTMLAttributes } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { ApiError } from '@/services/api/api-error'
import type { Product } from '@/types/catalog'
import { catalogFailureMessage } from './catalog-errors'

export const productQueryKey = (id: string) => ['admin-product', id]

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
} as const

/** Runs a product change, stores the returned product, and keeps the busy, error and notice state. */
export function useProductSaver(productId: string) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [notice, setNotice] = useState<string>()

  async function save(
    action: () => Promise<Product>,
    message: string
  ): Promise<Product | undefined> {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const product = await action()
      queryClient.setQueryData(productQueryKey(productId), product)
      setNotice(message)
      return product
    } catch (caught) {
      setError(caught)
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const reload = () => {
    setError(undefined)
    return queryClient.invalidateQueries({ queryKey: productQueryKey(productId) })
  }
  const clear = () => {
    setError(undefined)
    setNotice(undefined)
  }
  const fieldErrors: Record<string, string[]> =
    error instanceof ApiError ? { ...error.fieldErrors } : {}
  return { busy, error, notice, fieldErrors, save, reload, clear }
}

export type ProductSaver = ReturnType<typeof useProductSaver>

/**
 * Success notice or failure message of the last change, with a reload button for a version conflict.
 * Field-level errors are left to the form fields.
 */
export function SaveFeedback({ saver }: { saver: ProductSaver }) {
  const { error, notice } = saver
  const isConflict = error instanceof ApiError && error.code === 'VERSION_CONFLICT'
  const hasFieldErrors = Object.keys(saver.fieldErrors).length > 0
  return (
    <>
      {notice && (
        <p
          role="status"
          className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}
      {error !== undefined && (isConflict || !hasFieldErrors) && (
        <div>
          <FormAlert message={catalogFailureMessage(error)} />
          {isConflict && (
            <button
              type="button"
              onClick={() => void saver.reload()}
              className="font-label mt-2 min-h-11 text-ink underline"
            >
              Reload the product
            </button>
          )}
        </div>
      )}
    </>
  )
}

export function TextArea({
  label,
  error,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? `ta-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-label text-sm text-ink">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        className="min-h-28 w-full border border-rule-2 bg-paper px-3 py-2 text-ink disabled:opacity-50"
        {...props}
      />
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}
