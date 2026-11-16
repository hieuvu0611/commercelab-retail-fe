'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { createSupplier, listSuppliers, SUPPLIERS_KEY } from '@/procurement/procurement-api'
import type { Supplier } from '@/types/procurement'
import { StaffOnly } from './staff-only'
import { PROCUREMENT_ROLES } from './purchasing-orders-admin'

export function SuppliersAdmin() {
  return (
    <StaffOnly role={PROCUREMENT_ROLES} what="manage suppliers">
      <SuppliersView />
    </StaffOnly>
  )
}

function SuppliersView() {
  const queryClient = useQueryClient()
  const [showAddModal, setShowAddModal] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [formError, setFormError] = useState<string>('')

  const { data: suppliers = [], isLoading, error } = useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: listSuppliers,
  })

  const addMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY })
      setShowAddModal(false)
      setName('')
      setCode('')
      setEmail('')
      setPhone('')
      setAddress('')
      setFormError('')
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to add supplier'
      setFormError(message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!name.trim() || !code.trim()) {
      setFormError('Supplier Name and Code are required')
      return
    }
    addMutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      contactEmail: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Suppliers</h1>
          <p className="text-sm text-ink-2">Manage procurement suppliers and vendors</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/purchasing"
            className="rounded-button border border-rule-2 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
          >
            Purchase Orders
          </Link>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Add Supplier
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted">Loading suppliers...</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-600">Failed to load suppliers</div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-card border border-dashed border-rule-2 p-12 text-center text-sm text-muted">
          No suppliers found. Click &quot;Add Supplier&quot; to register a new vendor.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-rule bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-paper-2 text-xs font-semibold uppercase text-ink-2">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {suppliers.map((s: Supplier) => (
                <tr key={s.supplierId} className="hover:bg-paper-2">
                  <td className="px-4 py-3 font-semibold text-ink">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-ink-2">{s.contactEmail || '—'}</td>
                  <td className="px-4 py-3 text-ink-2">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-ink-2">{s.address || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-rule bg-paper p-6 shadow-xl">
            <h3 className="font-heading text-lg font-semibold text-ink">Add New Supplier</h3>
            {formError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="sup-name" className="font-label block text-xs font-medium text-ink">
                  Supplier Name *
                </label>
                <input
                  id="sup-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Everest Outdoor Gear Co."
                  className="mt-1 block h-9 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
                />
              </div>

              <div>
                <label htmlFor="sup-code" className="font-label block text-xs font-medium text-ink">
                  Supplier Code *
                </label>
                <input
                  id="sup-code"
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. EVEREST"
                  className="mt-1 block h-9 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sup-email" className="font-label block text-xs font-medium text-ink">
                    Email
                  </label>
                  <input
                    id="sup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="supply@vendor.com"
                    className="mt-1 block h-9 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="sup-phone" className="font-label block text-xs font-medium text-ink">
                    Phone
                  </label>
                  <input
                    id="sup-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0901234567"
                    className="mt-1 block h-9 w-full rounded-control border border-rule-2 bg-paper px-3 text-sm text-ink"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="sup-address" className="font-label block text-xs font-medium text-ink">
                  Address
                </label>
                <textarea
                  id="sup-address"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Factory or office address"
                  className="mt-1 block w-full rounded-control border border-rule-2 bg-paper p-2 text-sm text-ink"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-button border border-rule-2 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addMutation.isPending}
                  className="rounded-button bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {addMutation.isPending ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
