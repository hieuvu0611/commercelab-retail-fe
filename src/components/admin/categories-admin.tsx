'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  moveCategory,
  renameCategory,
  setCategoryActive,
} from '@/catalog/admin-api'
import { flattenTree, subtreeIds } from '@/catalog/category-tree'
import { FormAlert } from '@/components/auth/form-alert'
import { TextField } from '@/components/forms/text-field'
import { ApiError } from '@/services/api/api-error'
import type { CategoryNode } from '@/types/catalog'
import { AdminPanel } from './admin-panel'
import { catalogFailureMessage } from './catalog-errors'
import { StaffOnly } from './staff-only'

const MAX_DEPTH = 3
const QUERY_KEY = ['admin-categories']

type Panel =
  | { kind: 'create'; parent: CategoryNode | null }
  | { kind: 'rename' | 'move' | 'toggle' | 'delete'; node: CategoryNode }

interface FormValues {
  name: string
  parentId: string
}

function ParentSelect({
  tree,
  value,
  exclude,
  error,
  onChange,
}: {
  tree: CategoryNode[]
  value: string
  exclude?: Set<string>
  error?: string
  onChange: (value: string) => void
}) {
  const options = flattenTree(tree).filter(
    (node) => node.depth < MAX_DEPTH && !exclude?.has(node.id)
  )
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="parent-category" className="font-label text-sm text-ink">
        Parent category
      </label>
      <select
        id="parent-category"
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full border border-rule-2 bg-paper px-3 text-ink"
      >
        <option value="">Top level</option>
        {options.map((node) => (
          <option key={node.id} value={node.id}>
            {`${'– '.repeat(node.depth - 1)}${node.name}`}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}

function CategoryPanel({
  panel,
  tree,
  onSubmit,
  onCancel,
}: {
  panel: Panel
  tree: CategoryNode[]
  onSubmit: (values: FormValues) => Promise<void>
  onCancel: () => void
}) {
  const node = panel.kind === 'create' ? null : panel.node
  const [values, setValues] = useState<FormValues>({
    name: panel.kind === 'rename' ? panel.node.name : '',
    parentId:
      panel.kind === 'create'
        ? (panel.parent?.id ?? '')
        : panel.kind === 'move'
          ? (panel.node.parentId ?? '')
          : '',
  })
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string>()

  const titles = {
    create: 'Add category',
    rename: `Rename “${node?.name}”`,
    move: `Move “${node?.name}”`,
    toggle: node?.isActive ? `Deactivate “${node?.name}”` : `Activate “${node?.name}”`,
    delete: `Delete “${node?.name}”`,
  } as const
  const submitLabels = {
    create: 'Create category',
    rename: 'Save name',
    move: 'Move category',
    toggle: node?.isActive ? 'Deactivate' : 'Activate',
    delete: 'Delete category',
  } as const

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFormError(undefined)
    setFieldErrors({})
    try {
      await onSubmit(values)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors({ ...error.fieldErrors })
      } else {
        setFormError(catalogFailureMessage(error))
      }
      setBusy(false)
    }
  }

  return (
    <AdminPanel title={titles[panel.kind]} onCancel={onCancel}>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5" aria-busy={busy}>
        <FormAlert message={formError} />
        {panel.kind === 'toggle' && (
          <p className="text-ink-2">
            {node?.isActive
              ? 'Customers will no longer see this category in the shop menu.'
              : 'Customers will see this category in the shop menu again.'}
          </p>
        )}
        {panel.kind === 'delete' && (
          <p className="text-ink-2">
            This cannot be undone. A category with subcategories or products cannot be deleted.
          </p>
        )}
        {(panel.kind === 'create' || panel.kind === 'rename') && (
          <TextField
            label="Name"
            autoComplete="off"
            autoFocus
            value={values.name}
            error={fieldErrors.name?.[0]}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        )}
        {(panel.kind === 'create' || panel.kind === 'move') && (
          <ParentSelect
            tree={tree}
            value={values.parentId}
            exclude={panel.kind === 'move' ? subtreeIds(panel.node) : undefined}
            error={fieldErrors.parentId?.[0]}
            onChange={(parentId) => setValues({ ...values, parentId })}
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className={`btn self-start ${panel.kind === 'delete' ? 'btn-secondary text-error' : 'btn-primary'}`}
        >
          {busy ? 'Saving…' : submitLabels[panel.kind]}
        </button>
      </form>
    </AdminPanel>
  )
}

function Branch({ nodes, onAction }: { nodes: CategoryNode[]; onAction: (panel: Panel) => void }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id} className="border-b border-rule">
          <div className="flex flex-wrap items-center gap-x-4 py-1">
            <span
              className={`font-label ${node.isActive ? 'text-ink' : 'text-muted line-through'}`}
            >
              {node.name}
            </span>
            <span className="text-sm text-muted">/{node.path}</span>
            {!node.isActive && <span className="text-sm text-muted">Inactive</span>}
            <span className="ml-auto flex flex-wrap gap-x-3">
              {node.depth < MAX_DEPTH && (
                <ActionButton
                  label="Add subcategory"
                  name={node.name}
                  onClick={() => onAction({ kind: 'create', parent: node })}
                />
              )}
              <ActionButton
                label="Rename"
                name={node.name}
                onClick={() => onAction({ kind: 'rename', node })}
              />
              <ActionButton
                label="Move"
                name={node.name}
                onClick={() => onAction({ kind: 'move', node })}
              />
              <ActionButton
                label={node.isActive ? 'Deactivate' : 'Activate'}
                name={node.name}
                onClick={() => onAction({ kind: 'toggle', node })}
              />
              <ActionButton
                label="Delete"
                name={node.name}
                danger
                onClick={() => onAction({ kind: 'delete', node })}
              />
            </span>
          </div>
          {node.children.length > 0 && (
            <div className="ml-6">
              <Branch nodes={node.children} onAction={onAction} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ActionButton({
  label,
  name,
  danger,
  onClick,
}: {
  label: string
  name: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} ${name}`}
      className={`font-label min-h-11 text-sm underline ${danger ? 'text-error' : 'text-ink'}`}
    >
      {label}
    </button>
  )
}

export function CategoriesAdmin() {
  return (
    <StaffOnly role="PRODUCT_STAFF" what="manage categories">
      <CategoryTree />
    </StaffOnly>
  )
}

function CategoryTree() {
  const queryClient = useQueryClient()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string>()
  const categories = useQuery({ queryKey: QUERY_KEY, queryFn: listAdminCategories })

  const run = useMutation({
    mutationFn: async ({ current, values }: { current: Panel; values: FormValues }) => {
      const parentId = values.parentId || null
      switch (current.kind) {
        case 'create':
          return createCategory({ name: values.name, parentId })
        case 'rename':
          return renameCategory(current.node.id, values.name)
        case 'move':
          return moveCategory(current.node.id, parentId)
        case 'toggle':
          return setCategoryActive(current.node.id, !current.node.isActive)
        case 'delete':
          return deleteCategory(current.node.id)
      }
    },
  })

  const NOTICES = {
    create: 'The category was created.',
    rename: 'The category was renamed.',
    move: 'The category was moved.',
    toggle: 'The category was updated.',
    delete: 'The category was deleted.',
  } as const

  async function submit(values: FormValues) {
    if (!panel) return
    await run.mutateAsync({ current: panel, values })
    setNotice(NOTICES[panel.kind])
    setPanel(null)
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  const open = (next: Panel) => {
    setNotice(undefined)
    setPanel(next)
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => open({ kind: 'create', parent: null })}
      >
        Add top-level category
      </button>

      {notice && (
        <p
          role="status"
          className="mt-4 max-w-[40rem] border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      {panel && categories.data && (
        <CategoryPanel
          key={`${panel.kind}-${'node' in panel ? panel.node.id : (panel.parent?.id ?? 'root')}`}
          panel={panel}
          tree={categories.data}
          onSubmit={submit}
          onCancel={() => setPanel(null)}
        />
      )}

      <div className="mt-8">
        {categories.isError ? (
          <FormAlert message="We could not load the categories. Please reload the page." />
        ) : !categories.data ? (
          <p role="status" className="text-ink-2">
            Loading categories…
          </p>
        ) : categories.data.length === 0 ? (
          <p className="text-ink-2">There are no categories yet. Add the first one.</p>
        ) : (
          <Branch nodes={categories.data} onAction={open} />
        )}
      </div>
    </div>
  )
}
