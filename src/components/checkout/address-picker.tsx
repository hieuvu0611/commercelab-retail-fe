'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createAddress } from '@/addresses/address-api'
import { formatAddressLine } from '@/addresses/adapters'
import { AddressForm } from '@/components/account/address-form'
import { MAX_ADDRESSES, type Address, type AddressInput } from '@/types/checkout'

/** Choose the delivery address of the order, or save a new one without leaving checkout. */
export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onCreated,
}: {
  addresses: Address[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreated: (address: Address) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const showForm = isAdding || addresses.length === 0

  async function save(values: AddressInput) {
    const created = await createAddress(values)
    setIsAdding(false)
    onCreated(created)
  }

  return (
    <section aria-labelledby="address-heading">
      <h2 id="address-heading" className="text-xl">
        Delivery address
      </h2>
      {addresses.length > 0 && (
        <fieldset className="mt-3 flex flex-col gap-2">
          <legend className="sr-only">Choose a delivery address</legend>
          {addresses.map((address) => (
            <label
              key={address.id}
              className="flex cursor-pointer gap-3 border border-rule-2 p-4 has-[:checked]:border-2 has-[:checked]:border-ink"
            >
              <input
                type="radio"
                name="delivery-address"
                checked={address.id === selectedId}
                onChange={() => onSelect(address.id)}
                className="mt-1 size-5"
              />
              <span className="text-sm text-ink-2">
                <span className="font-label block text-base text-ink">
                  {address.recipient}
                  {address.isDefault && (
                    <span className="ml-2 border border-rule-2 px-1.5 text-xs font-normal">
                      Default
                    </span>
                  )}
                </span>
                {address.phone}
                <span className="block">{formatAddressLine(address)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {showForm ? (
        <div className="mt-4">
          <h3 className="font-label text-ink">
            {addresses.length === 0 ? 'Add a delivery address' : 'New address'}
          </h3>
          <div className="mt-3">
            <AddressForm
              submitLabel="Save and use this address"
              onSubmit={save}
              onCancel={addresses.length > 0 ? () => setIsAdding(false) : undefined}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {addresses.length < MAX_ADDRESSES && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="font-label min-h-11 underline"
            >
              Add a new address
            </button>
          )}
          <Link href="/account/addresses" className="font-label min-h-11 py-3 text-sm underline">
            Manage addresses
          </Link>
        </div>
      )}
    </section>
  )
}
