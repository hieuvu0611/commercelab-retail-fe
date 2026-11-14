'use client'

import { useState } from 'react'
import { patchAdminProduct } from '@/catalog/admin-products-api'
import { flattenTree } from '@/catalog/category-tree'
import { specsFromText, specsToText } from '@/catalog/specs'
import { TextField } from '@/components/forms/text-field'
import type { CategoryNode, Product } from '@/types/catalog'
import { SaveFeedback, TextArea, type ProductSaver } from './product-editor-shared'

interface TabProps {
  product: Product
  saver: ProductSaver
  isLocked: boolean
}

export function GeneralTab({ product, saver, isLocked }: TabProps) {
  const [name, setName] = useState(product.name)
  const [brand, setBrand] = useState(product.brand)
  const [description, setDescription] = useState(product.description)
  const [specs, setSpecs] = useState(specsToText(product.specs))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void saver.save(
      () =>
        patchAdminProduct(product.id, {
          version: product.version,
          name,
          brand,
          description,
          specs: specsFromText(specs),
        }),
      'General information saved.'
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-[40rem] flex-col gap-5">
      <SaveFeedback saver={saver} />
      <TextField
        label="Name"
        value={name}
        disabled={isLocked}
        error={saver.fieldErrors.name?.[0]}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label="Brand"
        value={brand}
        disabled={isLocked}
        onChange={(e) => setBrand(e.target.value)}
      />
      <TextArea
        label="Description"
        value={description}
        disabled={isLocked}
        error={saver.fieldErrors.description?.[0]}
        onChange={(e) => setDescription(e.target.value)}
      />
      <TextArea
        label="Specifications"
        hint="One per line, as Name: value."
        value={specs}
        disabled={isLocked}
        onChange={(e) => setSpecs(e.target.value)}
      />
      <button
        type="submit"
        disabled={saver.busy || isLocked}
        className="btn btn-primary self-start"
      >
        {saver.busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

export function CategoriesTab({
  product,
  saver,
  isLocked,
  categories,
}: TabProps & { categories: CategoryNode[] }) {
  const [primary, setPrimary] = useState(product.primaryCategoryId ?? '')
  const [selected, setSelected] = useState(new Set(product.categoryIds))
  const options = flattenTree(categories)

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void saver.save(
      () =>
        patchAdminProduct(product.id, {
          version: product.version,
          primaryCategoryId: primary || null,
          categoryIds: [...selected].filter((id) => id !== primary),
        }),
      'Categories saved.'
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-[40rem] flex-col gap-5">
      <SaveFeedback saver={saver} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="primary-category" className="font-label text-sm text-ink">
          Primary category
        </label>
        <select
          id="primary-category"
          value={primary}
          disabled={isLocked}
          onChange={(e) => setPrimary(e.target.value)}
          className="h-11 w-full border border-rule-2 bg-paper px-3 text-ink disabled:opacity-50"
        >
          <option value="">Choose a category</option>
          {options.map((node) => (
            <option key={node.id} value={node.id}>
              {`${'– '.repeat(node.depth - 1)}${node.name}`}
            </option>
          ))}
        </select>
      </div>
      <fieldset disabled={isLocked}>
        <legend className="font-label mb-1 text-sm text-ink">Also show in</legend>
        {options
          .filter((node) => node.id !== primary)
          .map((node) => (
            <label
              key={node.id}
              className="flex min-h-11 items-center gap-2 text-sm text-ink"
              style={{ paddingLeft: `${(node.depth - 1) * 1.25}rem` }}
            >
              <input
                type="checkbox"
                checked={selected.has(node.id)}
                onChange={() => toggle(node.id)}
                className="size-4 accent-accent"
              />
              {node.name}
            </label>
          ))}
      </fieldset>
      {saver.fieldErrors.categoryIds?.[0] && (
        <p role="alert" className="text-sm text-error">
          {saver.fieldErrors.categoryIds[0]}
        </p>
      )}
      <button
        type="submit"
        disabled={saver.busy || isLocked}
        className="btn btn-primary self-start"
      >
        {saver.busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
