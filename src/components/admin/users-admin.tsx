'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { ACCESS_ADMIN_ROLE, roleLabel } from '@/configs/roles'
import { ApiError } from '@/services/api/api-error'
import { storefrontApi } from '@/services/api/clients'
import { FormAlert } from '@/components/auth/form-alert'
import { CreateStaffPanel, DeactivatePanel, EditRolesPanel, type AdminUser } from './user-forms'

const PAGE_SIZE = 25
const USERS_KEY = 'admin-users'

type Panel =
  | { kind: 'create' }
  | { kind: 'roles'; user: AdminUser }
  | { kind: 'deactivate'; user: AdminUser }

interface UsersPage {
  items: AdminUser[]
  total: number
  pageCount: number
}

function describeGrant(role: string, warehouseId?: string): string {
  return warehouseId ? `${roleLabel(role)} · ${warehouseId}` : roleLabel(role)
}

export function UsersAdmin() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const [staffOnly, setStaffOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string>()

  const isAdmin = Boolean(session?.user?.roles.includes(ACCESS_ADMIN_ROLE))
  const myId = session?.user?.id

  const users = useQuery<UsersPage>({
    queryKey: [USERS_KEY, { staffOnly, page }],
    queryFn: async () => {
      const { data, metadata } = await storefrontApi.get<AdminUser[]>('/admin/users', {
        params: { staff: staffOnly, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      })
      return {
        items: data,
        total: metadata?.total ?? data.length,
        pageCount: metadata?.pageCount ?? 1,
      }
    },
    enabled: status === 'authenticated' && isAdmin,
  })

  const refreshList = () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] })

  const create = useMutation({
    mutationFn: (values: {
      email: string
      fullName: string
      password: string
      roles: unknown
      reason: string
    }) => storefrontApi.post('/admin/users', values, { skipUnauthorizedHandler: true }),
  })
  const setRoles = useMutation({
    mutationFn: ({ id, ...body }: { id: string; roles: unknown; reason: string }) =>
      storefrontApi.put(`/admin/users/${id}/roles`, body, { skipUnauthorizedHandler: true }),
  })
  const deactivate = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      storefrontApi.post(
        `/admin/users/${id}/deactivate`,
        { reason },
        { skipUnauthorizedHandler: true }
      ),
  })

  async function finish(message: string) {
    setPanel(null)
    setNotice(message)
    await refreshList()
  }

  if (status === 'loading') {
    return (
      <p role="status" className="mt-6 text-ink-2">
        Loading…
      </p>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mt-6 max-w-[40rem] border-t border-rule-2 bg-paper-2 px-6 py-8">
        <p className="font-label text-lg text-ink">
          You don&apos;t have permission to manage users
        </p>
        <p className="mt-2 max-w-[52ch] text-ink-2">
          Only access administrators can create staff accounts and change roles. Ask an
          administrator if you need access.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setNotice(undefined)
            setPanel({ kind: 'create' })
          }}
        >
          Add staff user
        </button>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={!staffOnly}
            onChange={(event) => {
              setStaffOnly(!event.target.checked)
              setPage(1)
            }}
            className="size-4 accent-accent"
          />
          Include customers
        </label>
      </div>

      {notice && (
        <p
          role="status"
          className="mt-4 max-w-[40rem] border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      {panel?.kind === 'create' && (
        <CreateStaffPanel
          title="Add staff user"
          submitLabel="Create user"
          busyLabel="Creating…"
          onCancel={() => setPanel(null)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            await finish('The user was created.')
          }}
        />
      )}
      {panel?.kind === 'roles' && (
        <EditRolesPanel
          user={panel.user}
          onCancel={() => setPanel(null)}
          onSubmit={async (values) => {
            await setRoles.mutateAsync({ id: panel.user.id, ...values })
            await finish('Roles were updated.')
          }}
        />
      )}
      {panel?.kind === 'deactivate' && (
        <DeactivatePanel
          user={panel.user}
          onCancel={() => setPanel(null)}
          onSubmit={async (values) => {
            await deactivate.mutateAsync({ id: panel.user.id, reason: values.reason })
            await finish('The account was deactivated.')
          }}
        />
      )}

      <div className="mt-8 overflow-x-auto">
        {users.isError ? (
          <FormAlert
            message={
              users.error instanceof ApiError && users.error.status === 403
                ? 'You do not have permission to see users.'
                : 'We could not load the users. Please reload the page.'
            }
          />
        ) : !users.data ? (
          <p role="status" className="text-ink-2">
            Loading users…
          </p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">{staffOnly ? 'Staff users' : 'All users'}</caption>
            <thead>
              <tr className="border-b border-rule-2 text-ink">
                <th scope="col" className="font-label py-3 pr-4">
                  Name
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Roles
                </th>
                <th scope="col" className="font-label py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="font-label py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((user) => {
                const isMe = user.id === myId
                return (
                  <tr key={user.id} className="border-b border-rule align-top">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <span className="font-label block text-ink">{user.fullName}</span>
                      <span className="text-muted">{user.email}</span>
                    </th>
                    <td className="py-3 pr-4">
                      <ul className="flex flex-col gap-1">
                        {user.roles.map((grant) => (
                          <li key={`${grant.role}@${grant.warehouseId ?? ''}`}>
                            {describeGrant(grant.role, grant.warehouseId)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-3 pr-4">{user.isActive ? 'Active' : 'Deactivated'}</td>
                    <td className="py-3">
                      {isMe ? (
                        <span className="text-muted">You can&apos;t change your own access</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-4">
                          <button
                            type="button"
                            className="font-label min-h-11 text-ink underline"
                            onClick={() => {
                              setNotice(undefined)
                              setPanel({ kind: 'roles', user })
                            }}
                            aria-label={`Change roles for ${user.fullName}`}
                          >
                            Change roles
                          </button>
                          {user.isActive && (
                            <button
                              type="button"
                              className="font-label min-h-11 text-error underline"
                              onClick={() => {
                                setNotice(undefined)
                                setPanel({ kind: 'deactivate', user })
                              }}
                              aria-label={`Deactivate ${user.fullName}`}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {users.data && users.data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {users.data.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= users.data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
