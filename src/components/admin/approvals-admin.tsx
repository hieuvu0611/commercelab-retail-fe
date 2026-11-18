'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react'
import { FormAlert } from '@/components/auth/form-alert'
import { decideApproval, listApprovals, STAFF_APPROVALS_KEY } from '@/returns/backoffice-returns-api'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/utils/tw-merge'
import type { ApprovalRecord } from '@/types/returns'
import { StaffOnly } from './staff-only'

export const APPROVAL_ROLES = [
  'CSKH',
  'CSKH_LEAD',
  'SUPPORT_AGENT',
  'SUPPORT_STAFF',
  'SUPPORT_LEAD',
  'WAREHOUSE_MGR',
  'FINANCE',
  'FINANCE_MGR',
  'PROCUREMENT',
  'PROCUREMENT_MGR',
  'OPS_MGR',
  'ADMIN',
] as const

export function ApprovalsAdmin() {
  return (
    <StaffOnly role={APPROVAL_ROLES} what="review and manage approval requests">
      <ApprovalsAdminView />
    </StaffOnly>
  )
}

function ApprovalsAdminView() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''

  const [tab, setTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRecord | null>(null)
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [decisionNote, setDecisionNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data: approvals = [], isLoading, isError, error } = useQuery({
    queryKey: [...STAFF_APPROVALS_KEY, tab],
    queryFn: () => listApprovals(tab === 'ALL' ? undefined : { status: tab }),
  })

  const decideMutation = useMutation({
    mutationFn: () => decideApproval(selectedApproval!.id, decisionAction, decisionNote),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_APPROVALS_KEY })
      setFeedback(`Yêu cầu ${selectedApproval?.id} đã được ${decisionAction === 'APPROVE' ? 'phê duyệt' : 'từ chối'} thành công.`)
      setSelectedApproval(null)
      setDecisionNote('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Thao tác thất bại'
      setFeedback(`Lỗi xử lý phê duyệt: ${msg}`)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Hàng đợi Phê duyệt (Maker ≠ Checker)</h1>
        <p className="text-sm text-ink-2">
          Thực thi chính sách P10 và Invariant I08: Người yêu cầu không được tự phê duyệt; tuân thủ các ngưỡng hạn mức thẩm quyền.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-card border border-rule bg-paper-2 p-4 text-sm font-medium text-ink flex items-center justify-between"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-ink-2 hover:text-ink hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-rule gap-6">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'pb-3 text-sm font-medium transition-colors border-b-2',
              tab === t
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-ink-2 hover:text-ink'
            )}
          >
            {t === 'PENDING' && 'Chờ duyệt'}
            {t === 'APPROVED' && 'Đã duyệt'}
            {t === 'REJECTED' && 'Đã từ chối'}
            {t === 'ALL' && 'Tất cả'}
          </button>
        ))}
      </div>

      {isError ? (
        <FormAlert
          message={
            error instanceof Error ? error.message : 'Không thể tải danh sách phê duyệt.'
          }
        />
      ) : isLoading ? (
        <div className="py-12 text-center text-sm text-ink-2">Đang tải danh sách phê duyệt...</div>
      ) : approvals.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-2">Không có yêu cầu phê duyệt nào</div>
      ) : (
        <div className="space-y-4">
          {approvals.map((app) => {
            const isSelfProposed = Boolean(currentUserId) && app.makerUserId === currentUserId
            return (
              <div
                key={app.id}
                className="rounded-card border border-rule bg-paper p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{app.id}</span>
                    <span
                      className={cn(
                        'rounded-xs px-2 py-0.5 text-xs font-bold uppercase',
                        app.status === 'PENDING' && 'bg-warn-soft text-warn',
                        app.status === 'APPROVED' && 'bg-ok-soft text-ok',
                        app.status === 'REJECTED' && 'bg-paper-2 text-ink-2'
                      )}
                    >
                      {app.status}
                    </span>
                    <span className="rounded-xs bg-paper-2 px-2 py-0.5 text-xs font-medium text-ink-2">
                      {app.requestType}
                    </span>
                  </div>

                  <span className="text-xs text-muted">
                    Tạo lúc: {new Date(app.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-paper-2 p-3 rounded-control">
                  <div>
                    <span className="text-xs text-ink-2 block">Mã tham chiếu:</span>
                    <span className="font-mono font-medium text-ink">{app.referenceId || app.rmaId}</span>
                  </div>
                  <div>
                    <span className="text-xs text-ink-2 block">Số tiền / Số lượng:</span>
                    <span className="font-semibold text-ink">
                      {app.amountVnd > 0 ? formatCurrency(app.amountVnd) : `${app.quantityDiff || 0} sản phẩm`}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-ink-2 block">Người yêu cầu (Maker):</span>
                    <span className="font-medium text-ink">{app.makerUserId}</span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-ink-2 block">Lý do yêu cầu:</span>
                  <p className="text-sm text-ink mt-0.5">{app.reason}</p>
                </div>

                {/* Policy P10 Notice */}
                {isSelfProposed && app.status === 'PENDING' && (
                  <div
                    data-testid="self-approval-warning"
                    className="flex items-center gap-2 rounded-control border border-warn bg-warn-soft p-3 text-xs text-warn"
                  >
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>
                      <strong>Quy định P10 (Maker ≠ Checker):</strong> Bạn là người tạo yêu cầu này. Nghiêm cấm tự phê duyệt. Bắt buộc quản lý khác kiểm tra và ký duyệt.
                    </span>
                  </div>
                )}

                {/* Actions */}
                {app.status === 'PENDING' && (
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-rule">
                    <button
                      type="button"
                      disabled={isSelfProposed}
                      onClick={() => {
                        setSelectedApproval(app)
                        setDecisionAction('REJECT')
                      }}
                      className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <XCircle className="size-3.5" />
                      <span>Từ chối</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSelfProposed}
                      onClick={() => {
                        setSelectedApproval(app)
                        setDecisionAction('APPROVE')
                      }}
                      className="btn btn-primary text-xs px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>Phê duyệt</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Decision Modal */}
      {selectedApproval && (
        <div
          role="dialog"
          aria-labelledby="decision-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        >
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-2xl space-y-4">
            <h3 id="decision-dialog-title" className="text-lg font-bold text-ink">
              {decisionAction === 'APPROVE' ? 'Xác nhận Phê duyệt' : 'Xác nhận Từ chối'}
            </h3>
            <p className="text-sm text-ink-2">
              Bạn đang {decisionAction === 'APPROVE' ? 'phê duyệt' : 'từ chối'} yêu cầu{' '}
              <span className="font-mono font-bold text-ink">{selectedApproval.id}</span> (Số tiền:{' '}
              {formatCurrency(selectedApproval.amountVnd)}).
            </p>

            <div>
              <label htmlFor="decision-note" className="block text-xs font-semibold text-ink-2">
                Ghi chú quyết định:
              </label>
              <textarea
                id="decision-note"
                rows={3}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Nhập ghi chú hoặc căn cứ phê duyệt..."
                className="mt-1 w-full rounded-control border border-rule bg-paper-2 p-2.5 text-sm text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="btn btn-secondary text-sm px-4"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => decideMutation.mutate()}
                disabled={decideMutation.isPending}
                className={cn(
                  'btn text-sm px-4',
                  decisionAction === 'APPROVE' ? 'btn-primary' : 'bg-warn text-white hover:bg-warn/90'
                )}
              >
                {decideMutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
