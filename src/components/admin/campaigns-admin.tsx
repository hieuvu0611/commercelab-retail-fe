'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import { AdminPanel } from './admin-panel'
import { StaffOnly } from './staff-only'
import {
  PROMOTIONS_KEY,
  createPromotionCampaign,
  listAdminPromotions,
  updatePromotionCampaign,
  type PromotionCampaign,
  type PromotionCampaignInput,
  type PromoStatus,
} from '@/vouchers/promotions-api'

const MARKETING_ROLES = ['MARKETING', 'OPS_MGR', 'SUPER_ADMIN', 'ACCESS_ADMIN'] as const

function toDateTimeLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function fromDateTimeLocalInput(val?: string | null): string | null {
  if (!val?.trim()) return null
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const EMPTY_FORM: PromotionCampaignInput = {
  code: '',
  name: '',
  discountType: 'PERCENT',
  discountValue: 10,
  maxDiscountVnd: 100000,
  minOrderVnd: 200000,
  eligibleCategoryIds: [],
  eligibleSkuIds: [],
  customerSegment: 'ALL',
  autoApply: false,
  stackable: true,
  priority: 20,
  totalQuota: 100,
  budgetVnd: 10000000,
  perCustomerLimit: 1,
  status: 'ACTIVE',
}

export function CampaignsAdmin() {
  return (
    <StaffOnly role={[...MARKETING_ROLES]} what="manage promotion campaigns">
      <CampaignList />
    </StaffOnly>
  )
}

function CampaignList() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<PromoStatus | ''>('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PromotionCampaignInput>(EMPTY_FORM)
  const [categoryText, setCategoryText] = useState('')
  const [skuText, setSkuText] = useState('')
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const campaigns = useQuery({
    queryKey: [...PROMOTIONS_KEY, statusFilter, search],
    queryFn: () => listAdminPromotions({ status: statusFilter, q: search }),
  })

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, startsAt: '', endsAt: '' })
    setCategoryText('')
    setSkuText('')
    setShowForm(true)
    setError(undefined)
  }

  function openEdit(c: PromotionCampaign) {
    setEditingId(c.campaignId)
    setForm({
      code: c.code,
      name: c.name,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscountVnd: c.maxDiscountVnd,
      minOrderVnd: c.minOrderVnd,
      eligibleCategoryIds: c.eligibleCategoryIds,
      eligibleSkuIds: c.eligibleSkuIds,
      customerSegment: c.customerSegment,
      autoApply: c.autoApply,
      stackable: c.stackable,
      priority: c.priority,
      totalQuota: c.totalQuota,
      budgetVnd: c.budgetVnd,
      perCustomerLimit: c.perCustomerLimit,
      startsAt: toDateTimeLocalInput(c.startsAt),
      endsAt: toDateTimeLocalInput(c.endsAt),
      status: c.status,
    })
    setCategoryText((c.eligibleCategoryIds ?? []).join(', '))
    setSkuText((c.eligibleSkuIds ?? []).join(', '))
    setShowForm(true)
    setError(undefined)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const payload: PromotionCampaignInput = {
        ...form,
        eligibleCategoryIds: categoryText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        eligibleSkuIds: skuText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        startsAt: fromDateTimeLocalInput(form.startsAt),
        endsAt: fromDateTimeLocalInput(form.endsAt),
      }
      if (editingId) {
        await updatePromotionCampaign(editingId, payload)
        setNotice(`Campaign ${form.code} updated.`)
      } else {
        await createPromotionCampaign(payload)
        setNotice(`Campaign ${payload.code.toUpperCase()} created.`)
      }
      setShowForm(false)
      setEditingId(null)
      await queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save promotion campaign.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(c: PromotionCampaign) {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const nextStatus: PromoStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      await updatePromotionCampaign(c.campaignId, {
        code: c.code,
        name: c.name,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxDiscountVnd: c.maxDiscountVnd,
        minOrderVnd: c.minOrderVnd,
        eligibleCategoryIds: c.eligibleCategoryIds,
        eligibleSkuIds: c.eligibleSkuIds,
        customerSegment: c.customerSegment,
        autoApply: c.autoApply,
        stackable: c.stackable,
        priority: c.priority,
        totalQuota: c.totalQuota,
        budgetVnd: c.budgetVnd,
        perCustomerLimit: c.perCustomerLimit,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        status: nextStatus,
      })
      setNotice(`Campaign ${c.code} is now ${nextStatus}.`)
      await queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="promo-search" className="font-label text-sm text-ink">
              Search
            </label>
            <input
              id="promo-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code or name…"
              className="rounded border border-rule-2 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="promo-status" className="font-label text-sm text-ink">
              Status
            </label>
            <select
              id="promo-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PromoStatus | '')}
              className="rounded border border-rule-2 bg-paper px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="btn btn-primary">
          New promotion campaign
        </button>
      </div>

      {notice && (
        <p role="status" className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}
      {error && <FormAlert message={error} />}

      {showForm && (
        <AdminPanel
          title={editingId ? `Edit ${form.code}` : 'New promotion campaign'}
          onCancel={() => {
            setShowForm(false)
            setEditingId(null)
          }}
        >
          <form onSubmit={(e) => void submitForm(e)} className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Code</span>
              <input
                required
                disabled={Boolean(editingId)}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Campaign name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Discount type</span>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountType: e.target.value as 'PERCENT' | 'FIXED_AMOUNT' }))
                }
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              >
                <option value="PERCENT">Percent (%)</option>
                <option value="FIXED_AMOUNT">Fixed Amount (VND)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">
                {form.discountType === 'PERCENT' ? 'Discount (%)' : 'Discount (VND)'}
              </span>
              <input
                type="number"
                min={1}
                max={form.discountType === 'PERCENT' ? 100 : undefined}
                required
                value={form.discountValue}
                onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Max discount cap (VND, 0 = none)</span>
              <input
                type="number"
                min={0}
                value={form.maxDiscountVnd}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountVnd: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Min order (VND)</span>
              <input
                type="number"
                min={0}
                value={form.minOrderVnd}
                onChange={(e) => setForm((f) => ({ ...f, minOrderVnd: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Total quota (orders)</span>
              <input
                type="number"
                min={1}
                required
                value={form.totalQuota}
                onChange={(e) => setForm((f) => ({ ...f, totalQuota: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">VND Budget cap (0 = unlimited)</span>
              <input
                type="number"
                min={0}
                value={form.budgetVnd}
                onChange={(e) => setForm((f) => ({ ...f, budgetVnd: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Priority (lower runs first)</span>
              <input
                type="number"
                min={1}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Segment</span>
              <select
                value={form.customerSegment}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    customerSegment: e.target.value as 'ALL' | 'NEW_CUSTOMER' | 'VIP',
                  }))
                }
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              >
                <option value="ALL">All customers</option>
                <option value="NEW_CUSTOMER">New customers only</option>
                <option value="VIP">VIP segment</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Per-customer limit</span>
              <input
                type="number"
                min={1}
                value={form.perCustomerLimit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    perCustomerLimit: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Starts at (optional)</span>
              <input
                type="datetime-local"
                value={form.startsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-label text-ink">Ends at (optional)</span>
              <input
                type="datetime-local"
                value={form.endsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-label text-ink">
                Eligible Category IDs (comma separated, blank = all)
              </span>
              <input
                value={categoryText}
                onChange={(e) => setCategoryText(e.target.value)}
                placeholder="cat-backpacks, cat-bottles"
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-label text-ink">Eligible SKUs (comma separated, blank = all)</span>
              <input
                value={skuText}
                onChange={(e) => setSkuText(e.target.value)}
                placeholder="SKU-BALO-BLACK-20L, SKU-BOTTLE-BLUE-500ML"
                className="rounded border border-rule-2 bg-paper px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.autoApply}
                  onChange={(e) => setForm((f) => ({ ...f, autoApply: e.target.checked }))}
                />
                <span>Auto-apply at checkout</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.stackable}
                  onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))}
                />
                <span>Stackable with other campaigns</span>
              </label>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? 'Saving…' : editingId ? 'Save campaign' : 'Create campaign'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </AdminPanel>
      )}

      {campaigns.isError ? (
        <FormAlert message="Failed to load promotion campaigns." />
      ) : !campaigns.data ? (
        <p role="status" className="text-ink-2">
          Loading promotion campaigns…
        </p>
      ) : campaigns.data.length === 0 ? (
        <p className="text-ink-2">No promotion campaigns found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th className="font-label py-2 pr-4">Campaign</th>
                <th className="font-label py-2 pr-4">Rule</th>
                <th className="font-label py-2 pr-4">Priority / Stack</th>
                <th className="font-label py-2 pr-4">Quota (Avail/Res/Used)</th>
                <th className="font-label py-2 pr-4">VND Budget</th>
                <th className="font-label py-2 pr-4">Status</th>
                <th className="font-label py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.data.map((c) => (
                <tr key={c.campaignId} className="border-b border-rule align-top">
                  <td className="py-3 pr-4">
                    <p className="font-label text-ink">{c.code}</p>
                    <p className="text-xs text-ink-2">{c.name}</p>
                    {c.autoApply && (
                      <span className="mt-1 inline-block rounded bg-paper-2 px-1.5 py-0.5 text-[11px] font-medium">
                        AUTO-APPLY
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-2">
                    <p>
                      {c.discountType === 'PERCENT'
                        ? `${c.discountValue}%`
                        : formatVnd(c.discountValue)}
                      {c.maxDiscountVnd > 0 ? ` (cap ${formatVnd(c.maxDiscountVnd)})` : ''}
                    </p>
                    <p>Min order: {formatVnd(c.minOrderVnd)}</p>
                    <p>Segment: {c.customerSegment}</p>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-2">
                    <p>P{c.priority}</p>
                    <p>{c.stackable ? 'Stackable' : 'Exclusive'}</p>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-xs">
                    {c.availableQuota} / {c.reservedQuota} / {c.consumedQuota}
                    <span className="block text-muted">of {c.totalQuota}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-xs">
                    {c.budgetVnd === 0 ? (
                      'Unlimited'
                    ) : (
                      <>
                        {formatVnd(c.budgetConsumedVnd + c.budgetReservedVnd)} /{' '}
                        {formatVnd(c.budgetVnd)}
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4">{c.status}</td>
                  <td className="py-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="text-xs underline text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleStatus(c)}
                      className="text-xs underline text-ink-2"
                    >
                      {c.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
