'use client'

import { useState } from 'react'
import { addSku, patchAdminProduct, removeSku, setSkuActive } from '@/catalog/admin-products-api'
import { formatVnd } from '@/catalog/money'
import { axesFromText } from '@/catalog/specs'
import { TextField } from '@/components/forms/text-field'
import type { Product } from '@/types/catalog'
import { SaveFeedback, type ProductSaver } from './product-editor-shared'

export function VariantsTab({
  product,
  saver,
  isLocked,
}: {
  product: Product
  saver: ProductSaver
  isLocked: boolean
}) {
  const [axesText, setAxesText] = useState(product.variantAxes.join(', '))
  const [skuId, setSkuId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  const saveAxes = (event: React.FormEvent) => {
    event.preventDefault()
    void saver.save(
      () =>
        patchAdminProduct(product.id, {
          version: product.version,
          variantAxes: axesFromText(axesText),
        }),
      'Variant axes saved.'
    )
  }

  async function submitSku(event: React.FormEvent) {
    event.preventDefault()
    const saved = await saver.save(
      () => addSku(product.id, product.version, { skuId, attributes: values }),
      'SKU added.'
    )
    if (saved) {
      setSkuId('')
      setValues({})
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SaveFeedback saver={saver} />

      <form onSubmit={saveAxes} noValidate className="flex max-w-[34rem] flex-col gap-3">
        <TextField
          label="Variant axes"
          hint="Comma separated, for example: color, capacity. Remove the SKUs before changing them."
          value={axesText}
          disabled={isLocked}
          error={saver.fieldErrors.variantAxes?.[0]}
          onChange={(e) => setAxesText(e.target.value)}
        />
        <button
          type="submit"
          disabled={saver.busy || isLocked}
          className="btn btn-secondary self-start"
        >
          Save axes
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">SKUs</caption>
          <thead>
            <tr className="border-b border-rule-2 text-ink">
              <th scope="col" className="font-label py-3 pr-4">
                SKU
              </th>
              {product.variantAxes.map((axis) => (
                <th key={axis} scope="col" className="font-label py-3 pr-4 capitalize">
                  {axis}
                </th>
              ))}
              <th scope="col" className="font-label py-3 pr-4">
                Price (excl. VAT)
              </th>
              <th scope="col" className="font-label py-3 pr-4">
                Status
              </th>
              <th scope="col" className="py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {product.skus.length === 0 && (
              <tr>
                <td colSpan={product.variantAxes.length + 4} className="py-4 text-ink-2">
                  No SKUs yet.
                </td>
              </tr>
            )}
            {product.skus.map((sku) => (
              <tr key={sku.skuId} className="border-b border-rule">
                <th scope="row" className="py-3 pr-4 font-normal text-ink">
                  {sku.skuId}
                </th>
                {product.variantAxes.map((axis) => (
                  <td key={axis} className="py-3 pr-4">
                    {sku.attributes[axis]}
                  </td>
                ))}
                <td className="py-3 pr-4">
                  {sku.unitPriceVnd === null ? 'Not set' : formatVnd(sku.unitPriceVnd)}
                </td>
                <td className="py-3 pr-4">{sku.isActive ? 'Active' : 'Inactive'}</td>
                <td className="py-3">
                  <button
                    type="button"
                    disabled={saver.busy || isLocked}
                    aria-label={`${sku.isActive ? 'Deactivate' : 'Activate'} ${sku.skuId}`}
                    onClick={() =>
                      void saver.save(
                        () => setSkuActive(product.id, product.version, sku.skuId, !sku.isActive),
                        'SKU updated.'
                      )
                    }
                    className="font-label min-h-11 pr-3 underline disabled:opacity-50"
                  >
                    {sku.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    disabled={saver.busy || isLocked}
                    aria-label={`Remove ${sku.skuId}`}
                    onClick={() =>
                      void saver.save(
                        () => removeSku(product.id, product.version, sku.skuId),
                        'SKU removed.'
                      )
                    }
                    className="font-label min-h-11 text-error underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={submitSku}
        noValidate
        className="flex max-w-[34rem] flex-col gap-4 border-t border-rule pt-6"
      >
        <h3 className="text-lg">Add a SKU</h3>
        <TextField
          label="SKU code"
          value={skuId}
          disabled={isLocked}
          error={saver.fieldErrors.skuId?.[0]}
          onChange={(e) => setSkuId(e.target.value)}
        />
        {product.variantAxes.map((axis) => (
          <TextField
            key={axis}
            label={axis.charAt(0).toUpperCase() + axis.slice(1)}
            value={values[axis] ?? ''}
            disabled={isLocked}
            onChange={(e) => setValues({ ...values, [axis]: e.target.value })}
          />
        ))}
        {saver.fieldErrors.attributes?.[0] && (
          <p role="alert" className="text-sm text-error">
            {saver.fieldErrors.attributes[0]}
          </p>
        )}
        <button
          type="submit"
          disabled={saver.busy || isLocked}
          className="btn btn-primary self-start"
        >
          Add SKU
        </button>
        <p className="text-sm text-muted">Prices are set on the Prices page.</p>
      </form>
    </div>
  )
}
