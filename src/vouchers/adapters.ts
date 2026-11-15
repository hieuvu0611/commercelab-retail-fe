import type { CampaignStatus, VoucherCampaign } from '@/types/voucher'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0

export function toCampaign(raw: unknown): VoucherCampaign {
  const campaign = asRaw(raw)
  const totalQuota = whole(campaign.totalQuota)
  const reservedQuota = whole(campaign.reservedQuota)
  const consumedQuota = whole(campaign.consumedQuota)
  const status: CampaignStatus = campaign.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
  return {
    code: text(campaign.code),
    name: text(campaign.name),
    discountPct: whole(campaign.discountPct),
    totalQuota,
    availableQuota: whole(campaign.availableQuota ?? totalQuota - reservedQuota - consumedQuota),
    reservedQuota,
    consumedQuota,
    perCustomerLimit: whole(campaign.perCustomerLimit) || 1,
    startsAt: text(campaign.startsAt) || null,
    endsAt: text(campaign.endsAt) || null,
    status,
  }
}

/** "2026-11-15T10:00" (a datetime-local value in the browser's zone) from an ISO timestamp; empty when open. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** An ISO timestamp from a datetime-local value; null when empty. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
