import type { Address } from '@/types/checkout'

type Raw = Record<string, unknown>

const asRaw = (value: unknown): Raw =>
  value !== null && typeof value === 'object' ? (value as Raw) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toAddress(raw: unknown): Address {
  const address = asRaw(raw)
  return {
    id: text(address.id),
    recipient: text(address.recipient),
    phone: text(address.phone),
    line1: text(address.line1),
    ward: text(address.ward),
    district: text(address.district),
    province: text(address.province),
    isDefault: address.isDefault === true,
  }
}

/** The default address first, then the order the service sent. */
export const toAddressList = (raw: unknown): Address[] =>
  (Array.isArray(raw) ? raw : [])
    .map(toAddress)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))

export const formatAddressLine = (address: Address): string =>
  [address.line1, address.ward, address.district, address.province].filter(Boolean).join(', ')
