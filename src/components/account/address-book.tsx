'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { formatAddressLine } from '@/addresses/adapters'
import {
  ADDRESSES_KEY,
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '@/addresses/address-api'
import { useCart } from '@/cart/cart-context'
import { FormAlert } from '@/components/auth/form-alert'
import { ConfirmDialog } from '@/components/commons/confirm-dialog'
import { MAX_ADDRESSES, type Address, type AddressInput } from '@/types/checkout'
import { AddressForm } from './address-form'

type Editing = { kind: 'new' } | { kind: 'edit'; address: Address }

const toInput = ({ id: _id, ...input }: Address): AddressInput => input

/** The customer's saved delivery addresses: add, edit, choose the default and delete. */
export function AddressBook() {
  const queryClient = useQueryClient()
  const { isSignedIn } = useCart()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Address | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  // Wait for the session: a request sent before the access token is known would end the session with a 401.
  const addresses = useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: listAddresses,
    staleTime: 0,
    enabled: isSignedIn,
  })
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY }),
    [queryClient]
  )

  async function save(values: AddressInput) {
    if (editing?.kind === 'edit') await updateAddress(editing.address.id, values)
    else await createAddress(values)
    setNotice(editing?.kind === 'edit' ? 'The address was updated.' : 'The address was saved.')
    setError(undefined)
    setEditing(null)
    await refresh()
  }

  async function makeDefault(address: Address) {
    setNotice(undefined)
    setError(undefined)
    try {
      await updateAddress(address.id, { ...toInput(address), isDefault: true })
      setNotice(`${address.recipient}'s address is now your default.`)
      await refresh()
    } catch {
      setError('We could not change your default address. Please try again.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setIsDeleting(true)
    setNotice(undefined)
    try {
      await deleteAddress(deleting.id)
      setNotice('The address was deleted.')
      setError(undefined)
      await refresh()
    } catch {
      setError('We could not delete this address. Please try again.')
    } finally {
      setIsDeleting(false)
      setDeleting(null)
    }
  }

  if (addresses.isError)
    return (
      <div className="mt-8">
        <FormAlert message="We could not load your addresses. Please reload the page." />
      </div>
    )
  if (!addresses.data)
    return (
      <p role="status" className="mt-8 text-ink-2">
        Loading your addresses…
      </p>
    )

  const list = addresses.data
  const isFull = list.length >= MAX_ADDRESSES

  return (
    <div className="mt-8 max-w-[44rem]">
      <FormAlert message={error} />
      {notice && (
        <p
          role="status"
          className="mb-4 border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      {list.length === 0 && !editing && (
        <p className="text-ink-2">You have no saved addresses yet.</p>
      )}
      <ul aria-label="Saved addresses" className="flex flex-col gap-3">
        {list.map((address) => (
          <li key={address.id} className="border border-rule-2 p-4">
            <p className="font-label text-ink">
              {address.recipient}
              {address.isDefault && (
                <span className="ml-2 border border-rule-2 px-1.5 text-xs font-normal">
                  Default
                </span>
              )}
            </p>
            <p className="text-sm text-ink-2">{address.phone}</p>
            <p className="text-sm text-ink-2">{formatAddressLine(address)}</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <button
                type="button"
                aria-label={`Edit address of ${address.recipient}`}
                onClick={() => {
                  setNotice(undefined)
                  setEditing({ kind: 'edit', address })
                }}
                className="font-label min-h-11 text-sm underline"
              >
                Edit
              </button>
              {!address.isDefault && (
                <button
                  type="button"
                  aria-label={`Make the address of ${address.recipient} the default`}
                  onClick={() => void makeDefault(address)}
                  className="font-label min-h-11 text-sm underline"
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete address of ${address.recipient}`}
                onClick={() => setDeleting(address)}
                className="font-label min-h-11 text-sm underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <section
          aria-label={editing.kind === 'new' ? 'New address' : 'Edit address'}
          className="mt-6 border-t-4 border-ink bg-paper-2 px-5 py-5"
        >
          <h2 className="text-xl">{editing.kind === 'new' ? 'New address' : 'Edit address'}</h2>
          <div className="mt-4">
            <AddressForm
              key={editing.kind === 'edit' ? editing.address.id : 'new'}
              initial={editing.kind === 'edit' ? toInput(editing.address) : undefined}
              submitLabel="Save address"
              onSubmit={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        </section>
      ) : isFull ? (
        <p className="mt-4 text-sm text-ink-2">
          You have saved {MAX_ADDRESSES} addresses, the most we can keep. Delete one to add another.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNotice(undefined)
            setEditing({ kind: 'new' })
          }}
          className="btn btn-primary mt-4"
        >
          Add an address
        </button>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this address?"
          confirmLabel="Delete address"
          isBusy={isDeleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => !isDeleting && setDeleting(null)}
        >
          <p>
            {deleting.recipient}, {formatAddressLine(deleting)}.
            {deleting.isDefault && ' Your newest remaining address becomes the default.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
