import { storefrontApi } from '@/services/api/clients'
import type { Address, AddressInput } from '@/types/checkout'
import { toAddress, toAddressList } from './adapters'

// Customer address book (P4-T02). Mutations skip the global 401 sign-out so a form can show the error.
const quiet = { skipUnauthorizedHandler: true } as const

export const ADDRESSES_KEY = ['addresses'] as const

export const listAddresses = async (): Promise<Address[]> =>
  toAddressList((await storefrontApi.get<unknown>('/users/me/addresses')).data)

export async function createAddress(input: AddressInput): Promise<Address> {
  const { data } = await storefrontApi.post<unknown>('/users/me/addresses', input, quiet)
  return toAddress(data)
}

export async function updateAddress(id: string, input: AddressInput): Promise<Address> {
  const { data } = await storefrontApi.put<unknown>(
    `/users/me/addresses/${encodeURIComponent(id)}`,
    input,
    quiet
  )
  return toAddress(data)
}

export const deleteAddress = (id: string) =>
  storefrontApi.delete<unknown>(`/users/me/addresses/${encodeURIComponent(id)}`, quiet)
