'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { ConfirmDialog } from '@/components/commons/confirm-dialog'
import { TextField } from '@/components/forms/text-field'
import {
  VOUCHERS_KEY,
  createCampaign,
  listCampaigns,
  updateCampaign,
} from '@/vouchers/admin-vouchers-api'
import type { CampaignStatus, VoucherCampaign, VoucherCampaignInput } from '@/types/voucher'
import { AdminPanel } from './admin-panel'
import { StaffOnly } from './staff-only'
import { VoucherForm } from './voucher-form'

const PAGE_SIZE = 15

type Panel = { kind: 'new' } | { kind: 'edit'; campaign: VoucherCampaign }

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function formatWindow(campaign: Pick<VoucherCampaign, 'startsAt' | 'endsAt'>): string {
  const { startsAt, endsAt } = campaign
  if (!startsAt && !endsAt) return 'Always open'
  const show = (iso: string | null, fallback: string) =>
    iso ? dateFormat.format(new Date(iso)) : fallback
  return `${show(startsAt, 'Now')} to ${show(endsAt, 'no end')}`
}

const toInput = (campaign: VoucherCampaign, status: CampaignStatus): VoucherCampaignInput => ({
  code: campaign.code,
  name: campaign.name,
  discountPct: campaign.discountPct,
  totalQuota: campaign.totalQuota,
  perCustomerLimit: campaign.perCustomerLimit,
  startsAt: campaign.startsAt,
  endsAt: campaign.endsAt,
  status,
})

export function VouchersAdmin() {
  return (
    <StaffOnly role="MARKETING" what="manage voucher campaigns">
      <VoucherList />
    </StaffOnly>
  )
}

function VoucherList() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CampaignStatus | ''>('')
  const [page, setPage] = useState(1)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [deactivating, setDeactivating] = useState<VoucherCampaign | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const campaigns = useQuery({
    queryKey: [...VOUCHERS_KEY, { q, status, page }],
    queryFn: () => listCampaigns({ q, status, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: VOUCHERS_KEY })

  async function save(input: VoucherCampaignInput) {
    if (panel?.kind === 'edit') await updateCampaign(input)
    else await createCampaign(input)
    setNotice(
      panel?.kind === 'edit'
        ? `Voucher ${input.code} was updated.`
        : `Voucher ${input.code} was created.`
    )
    setError(undefined)
    setPanel(null)
    await refresh()
  }

  async function changeStatus(campaign: VoucherCampaign, next: CampaignStatus) {
    setIsBusy(true)
    setNotice(undefined)
    setError(undefined)
    try {
      await updateCampaign(toInput(campaign, next))
      setNotice(
        next === 'PAUSED'
          ? `Voucher ${campaign.code} was deactivated.`
          : `Voucher ${campaign.code} is active again.`
      )
      await refresh()
    } catch {
      setError(`We could not change voucher ${campaign.code}. Please try again.`)
    } finally {
      setIsBusy(false)
      setDeactivating(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setQ(search.trim())
            setPage(1)
          }}
          className="flex items-end gap-2"
        >
          <div className="w-64">
            <TextField
              label="Search vouchers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="voucher-status" className="font-label text-sm text-ink">
            Status
          </label>
          <select
            id="voucher-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CampaignStatus | '')
              setPage(1)
            }}
            className="h-11 rounded-control border border-rule-2 bg-paper px-3 text-ink"
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Inactive</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(undefined)
            setPanel({ kind: 'new' })
          }}
          className="btn btn-primary"
        >
          New voucher
        </button>
      </div>

      <div className="mt-4 max-w-[40rem] flex flex-col gap-3">
        <FormAlert message={error} />
        {notice && (
          <p
            role="status"
            className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
          >
            {notice}
          </p>
        )}
      </div>

      {panel && (
        <AdminPanel
          title={panel.kind === 'new' ? 'New voucher campaign' : `Edit ${panel.campaign.code}`}
          onCancel={() => setPanel(null)}
        >
          <VoucherForm
            key={panel.kind === 'edit' ? panel.campaign.code : 'new'}
            campaign={panel.kind === 'edit' ? panel.campaign : undefined}
            onSubmit={save}
            onCancel={() => setPanel(null)}
          />
        </AdminPanel>
      )}

      <div className="mt-8 overflow-x-auto">
        {campaigns.isError ? (
          <FormAlert message="We could not load the vouchers. Please reload the page." />
        ) : !campaigns.data ? (
          <p role="status" className="text-ink-2">
            Loading vouchers…
          </p>
        ) : campaigns.data.items.length === 0 ? (
          <p className="text-ink-2">No vouchers match.</p>
        ) : (
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <caption className="sr-only">Voucher campaigns</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                {['Code', 'Discount', 'Window', 'Available', 'Reserved', 'Used', 'Status'].map(
                  (heading) => (
                    <th key={heading} scope="col" className="font-label py-3 pr-4">
                      {heading}
                    </th>
                  )
                )}
                <th scope="col" className="py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.data.items.map((campaign) => (
                <tr key={campaign.code} className="border-b border-rule align-top">
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    {campaign.code}
                    <span className="block text-muted">{campaign.name}</span>
                  </th>
                  <td className="py-3 pr-4">{campaign.discountPct}%</td>
                  <td className="py-3 pr-4">{formatWindow(campaign)}</td>
                  <td className="py-3 pr-4">
                    {campaign.availableQuota} of {campaign.totalQuota}
                  </td>
                  <td className="py-3 pr-4">{campaign.reservedQuota}</td>
                  <td className="py-3 pr-4">{campaign.consumedQuota}</td>
                  <td className="py-3 pr-4">
                    {campaign.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      aria-label={`Edit ${campaign.code}`}
                      onClick={() => {
                        setNotice(undefined)
                        setPanel({ kind: 'edit', campaign })
                      }}
                      className="font-label min-h-11 pr-3 underline"
                    >
                      Edit
                    </button>
                    {campaign.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        aria-label={`Deactivate ${campaign.code}`}
                        onClick={() => setDeactivating(campaign)}
                        className="font-label min-h-11 underline"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Activate ${campaign.code}`}
                        disabled={isBusy}
                        onClick={() => void changeStatus(campaign, 'ACTIVE')}
                        className="font-label min-h-11 underline"
                      >
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {campaigns.data && campaigns.data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((c) => c - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {campaigns.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= campaigns.data.pageCount}
            onClick={() => setPage((c) => c + 1)}
          >
            Next
          </button>
        </nav>
      )}

      {deactivating && (
        <ConfirmDialog
          title={`Deactivate ${deactivating.code}?`}
          confirmLabel="Deactivate voucher"
          isBusy={isBusy}
          onConfirm={() => void changeStatus(deactivating, 'PAUSED')}
          onCancel={() => !isBusy && setDeactivating(null)}
        >
          <p>
            Customers will not be able to use it until you activate it again. Orders that already
            reserved it are not affected. Vouchers are never deleted.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
