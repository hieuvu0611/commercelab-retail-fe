'use client'

import { useState } from 'react'
import { runWorkflow, type WorkflowAction } from '@/catalog/admin-products-api'
import { ApiError } from '@/services/api/api-error'
import type { Product } from '@/types/catalog'
import { SaveFeedback, STATUS_LABELS, TextArea, type ProductSaver } from './product-editor-shared'

const PROBLEM_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  primaryCategoryId: 'Category',
  images: 'Images',
  skus: 'Variants and prices',
}

const NOTICES: Record<WorkflowAction, string> = {
  'submit-review': 'The product was sent for review.',
  publish: 'The product is published.',
  reject: 'The product was sent back to draft.',
  unpublish: 'The product was unpublished.',
}

export function StatusTab({ product, saver }: { product: Product; saver: ProductSaver }) {
  const [reason, setReason] = useState('')
  const problems =
    saver.error instanceof ApiError && saver.error.code === 'PUBLISH_VALIDATION_FAILED'
      ? Object.entries(saver.error.fieldErrors)
      : []

  const run = (action: WorkflowAction) =>
    void saver.save(
      () => runWorkflow(product.id, product.version, action, reason.trim() || undefined),
      NOTICES[action]
    )

  return (
    <div className="flex max-w-[40rem] flex-col gap-5">
      <p className="text-ink">
        Current status: <strong className="font-label">{STATUS_LABELS[product.status]}</strong>
      </p>
      {product.rejectionReason && product.status === 'DRAFT' && (
        <p className="border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink">
          Sent back for changes: {product.rejectionReason}
        </p>
      )}
      <SaveFeedback saver={saver} />

      {problems.length > 0 && (
        <div role="alert" className="border-l-4 border-error bg-paper-2 px-4 py-3">
          <p className="font-label text-ink">
            This product cannot be published yet. Fix these first:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink">
            {problems.flatMap(([field, messages]) =>
              messages.map((message) => (
                <li key={`${field}-${message}`}>
                  <span className="font-label">{PROBLEM_LABELS[field] ?? field}:</span> {message}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {product.status === 'IN_REVIEW' && (
        <TextArea
          label="Reason (required to send back)"
          value={reason}
          error={saver.fieldErrors.reason?.[0]}
          onChange={(e) => setReason(e.target.value)}
        />
      )}

      <div className="flex flex-wrap gap-3">
        {(product.status === 'DRAFT' || product.status === 'UNPUBLISHED') && (
          <button
            type="button"
            disabled={saver.busy}
            onClick={() => run('submit-review')}
            className="btn btn-primary"
          >
            Submit for review
          </button>
        )}
        {product.status === 'IN_REVIEW' && (
          <>
            <button
              type="button"
              disabled={saver.busy}
              onClick={() => run('publish')}
              className="btn btn-primary"
            >
              Publish
            </button>
            <button
              type="button"
              disabled={saver.busy}
              onClick={() => run('reject')}
              className="btn btn-secondary"
            >
              Send back to draft
            </button>
          </>
        )}
        {product.status === 'PUBLISHED' && (
          <button
            type="button"
            disabled={saver.busy}
            onClick={() => run('unpublish')}
            className="btn btn-secondary"
          >
            Unpublish
          </button>
        )}
      </div>
      {product.status === 'PUBLISHED' && (
        <p className="text-sm text-muted">
          Unpublishing stops new orders and keeps existing order history.
        </p>
      )}
    </div>
  )
}
