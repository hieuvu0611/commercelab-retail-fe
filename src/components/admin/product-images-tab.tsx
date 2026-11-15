'use client'

import { useRef, useState } from 'react'
import {
  attachImage,
  removeImage,
  reorderImages,
  requestUploadUrl,
  uploadToPresignedUrl,
} from '@/catalog/admin-products-api'
import { FormAlert } from '@/components/auth/form-alert'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type Product } from '@/types/catalog'
import { SaveFeedback, type ProductSaver } from './product-editor-shared'

/** Client-side check of the same rules the API enforces (P2-T07): JPEG, PNG or WebP, at most 5 MB. */
export function imageFileProblem(file: { type: string; size: number }): string | undefined {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type))
    return 'Use a JPEG, PNG or WebP image.'
  if (file.size > MAX_IMAGE_BYTES) return 'The image must be 5 MB or smaller.'
  return undefined
}

export function ImagesTab({
  product,
  saver,
  isLocked,
}: {
  product: Product
  saver: ProductSaver
  isLocked: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [fileProblem, setFileProblem] = useState<string>()

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = imageFileProblem(file)
    setFileProblem(problem)
    if (problem) return
    await saver.save(async () => {
      const target = await requestUploadUrl(product.id, file)
      await uploadToPresignedUrl(target, file)
      return attachImage(product.id, product.version, target, product.name)
    }, 'Image added.')
  }

  function move(index: number, delta: -1 | 1) {
    const ids = product.images.map((image) => image.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + delta, 0, moved)
    void saver.save(() => reorderImages(product.id, product.version, ids), 'Image order saved.')
  }

  return (
    <div className="flex max-w-[40rem] flex-col gap-6">
      <SaveFeedback saver={saver} />
      <FormAlert
        message={fileProblem ?? saver.fieldErrors.contentType?.[0] ?? saver.fieldErrors.size?.[0]}
      />
      <div>
        <label htmlFor="image-file" className="font-label block text-sm text-ink">
          Add an image
        </label>
        <input
          id="image-file"
          ref={input}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          disabled={saver.busy || isLocked}
          onChange={(event) => void upload(event)}
          className="mt-1 block min-h-11 text-sm"
        />
        <p className="mt-1 text-sm text-muted">
          JPEG, PNG or WebP, up to 5 MB. The first image is the main one.
        </p>
      </div>

      {product.images.length === 0 ? (
        <p className="text-ink-2">No images yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {product.images.map((image, index) => (
            <li
              key={image.id}
              className="flex flex-wrap items-center gap-4 border-b border-rule pb-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt ?? ''} className="size-16 object-cover" />
              <span className="text-sm text-ink">
                {index === 0 ? 'Main image' : `Image ${index + 1}`}
              </span>
              <span className="ml-auto flex gap-3">
                <button
                  type="button"
                  disabled={index === 0 || saver.busy || isLocked}
                  onClick={() => move(index, -1)}
                  aria-label={`Move image ${index + 1} up`}
                  className="font-label min-h-11 underline disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={index === product.images.length - 1 || saver.busy || isLocked}
                  onClick={() => move(index, 1)}
                  aria-label={`Move image ${index + 1} down`}
                  className="font-label min-h-11 underline disabled:opacity-40"
                >
                  Down
                </button>
                <button
                  type="button"
                  disabled={saver.busy || isLocked}
                  onClick={() =>
                    void saver.save(
                      () => removeImage(product.id, product.version, image.id),
                      'Image removed.'
                    )
                  }
                  aria-label={`Remove image ${index + 1}`}
                  className="font-label min-h-11 text-error underline disabled:opacity-40"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
