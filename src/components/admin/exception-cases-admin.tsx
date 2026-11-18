'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { AlertTriangle, CheckCircle, Clock, UserCheck, ShieldCheck } from 'lucide-react'
import { FormAlert } from '@/components/auth/form-alert'
import {
  assignExceptionCase,
  CASES_KEY,
  listExceptionCases,
  resolveExceptionCase,
} from '@/cases/cases-api'
import { cn } from '@/utils/tw-merge'
import type { ExceptionCase } from '@/cases/types'
import { StaffOnly } from './staff-only'

export const EXCEPTION_CASE_ROLES = [
  'CSKH',
  'CSKH_LEAD',
  'SUPPORT_AGENT',
  'SUPPORT_STAFF',
  'SUPPORT_LEAD',
  'WAREHOUSE_STAFF',
  'WAREHOUSE_MGR',
  'DELIVERY_COORD',
  'FINANCE',
  'FINANCE_STAFF',
  'FINANCE_MGR',
  'OPS_MGR',
  'ADMIN',
] as const

export function ExceptionCasesAdmin() {
  return (
    <StaffOnly role={EXCEPTION_CASE_ROLES} what="manage exception cases">
      <ExceptionCasesAdminView />
    </StaffOnly>
  )
}

function ExceptionCasesAdminView() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id ?? ''
  const [tab, setTab] = useState<'ALL' | 'OPEN_UNASSIGNED' | 'ASSIGNED_IN_PROGRESS' | 'RESOLVED_WITH_EVIDENCE'>('ALL')
  const [selectedCase, setSelectedCase] = useState<ExceptionCase | null>(null)
  const [modalMode, setModalMode] = useState<'ASSIGN' | 'RESOLVE' | null>(null)
  const [assignOwnerId, setAssignOwnerId] = useState('')
  const [resolutionEvidence, setResolutionEvidence] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: cases = [], isLoading, isError, error } = useQuery({
    queryKey: [...CASES_KEY, tab],
    queryFn: () => listExceptionCases(tab === 'ALL' ? undefined : { status: tab }),
  })

  const assignMutation = useMutation({
    mutationFn: () => assignExceptionCase(selectedCase!.caseId, assignOwnerId.trim()),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: CASES_KEY })
      setActionError(null)
      setFeedback(`Hồ sơ ${updated.caseId} đã được phân công cho ${assignOwnerId.trim()} thành công.`)
      setModalMode(null)
      setSelectedCase(null)
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Không thể phân công hồ sơ ngoại lệ.')
    },
  })

  const resolveMutation = useMutation({
    mutationFn: () =>
      resolveExceptionCase(selectedCase!.caseId, resolutionEvidence, resolutionNote),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: CASES_KEY })
      setActionError(null)
      setFeedback(`Hồ sơ ${updated.caseId} đã được đóng với bằng chứng xác thực thành công (Mục 17).`)
      setModalMode(null)
      setSelectedCase(null)
      setResolutionEvidence('')
      setResolutionNote('')
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Không thể đóng hồ sơ ngoại lệ.')
    },
  })

  const now = new Date().getTime()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Quản lý Hồ sơ Ngoại lệ (Exception Cases)</h1>
        <p className="text-sm text-ink-2">
          Theo Mục 17 & Scenario SC12: Mọi sự cố không thể tự động xử lý đều có Case ID, SLA phân công trong 30 phút, lịch sử timeline và bằng chứng giải quyết. <strong>Nghiêm cấm tự đóng bằng timeout.</strong>
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

      {actionError && <FormAlert message={actionError} />}

      {/* Tabs */}
      <div className="flex border-b border-rule gap-6">
        {(['ALL', 'OPEN_UNASSIGNED', 'ASSIGNED_IN_PROGRESS', 'RESOLVED_WITH_EVIDENCE'] as const).map((t) => (
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
            {t === 'ALL' && 'Tất cả vụ việc'}
            {t === 'OPEN_UNASSIGNED' && 'Chưa phân công'}
            {t === 'ASSIGNED_IN_PROGRESS' && 'Đang xử lý'}
            {t === 'RESOLVED_WITH_EVIDENCE' && 'Đã giải quyết'}
          </button>
        ))}
      </div>

      {isError ? (
        <FormAlert
          message={
            error instanceof Error ? error.message : 'Không thể tải danh sách hồ sơ ngoại lệ.'
          }
        />
      ) : isLoading ? (
        <div className="py-12 text-center text-sm text-ink-2">Đang tải hồ sơ ngoại lệ...</div>
      ) : cases.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-2">Không có vụ việc ngoại lệ nào trong danh mục này</div>
      ) : (
        <div className="space-y-4">
          {cases.map((c) => {
            const isOverdue =
              c.status === 'OPEN_UNASSIGNED' && now > new Date(c.slaFirstAssignDueAt).getTime()

            return (
              <div
                key={c.caseId}
                className="rounded-card border border-rule bg-paper p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{c.caseId}</span>
                    <span
                      className={cn(
                        'rounded-xs px-2 py-0.5 text-xs font-bold uppercase',
                        c.status === 'OPEN_UNASSIGNED' && 'bg-warn-soft text-warn',
                        c.status === 'ASSIGNED_IN_PROGRESS' && 'bg-accent/10 text-accent',
                        c.status === 'RESOLVED_WITH_EVIDENCE' && 'bg-ok-soft text-ok'
                      )}
                    >
                      {c.status.replace(/_/g, ' ')}
                    </span>
                    <span className="rounded-xs bg-paper-2 px-2 py-0.5 text-xs font-medium text-ink-2">
                      {c.category}
                    </span>
                  </div>

                  {/* SLA Badge */}
                  {c.status === 'OPEN_UNASSIGNED' ? (
                    isOverdue ? (
                      <span className="flex items-center gap-1 rounded-xs bg-warn-soft px-2 py-1 text-xs font-bold text-warn animate-pulse">
                        <AlertTriangle className="size-3.5" />
                        <span>QUÁ HẠN PHÂN CÔNG 30 PHÚT (MỤC 17)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-xs bg-paper-2 px-2 py-1 text-xs font-medium text-ink-2">
                        <Clock className="size-3.5" />
                        <span>SLA phân công: Trong hạn 30m</span>
                      </span>
                    )
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-ok font-medium">
                      <ShieldCheck className="size-3.5" />
                      <span>Người phụ trách: {c.ownerId}</span>
                    </span>
                  )}
                </div>

                <div className="bg-paper-2 p-3 rounded-control text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-2">Mã tham chiếu: <strong className="font-mono text-ink">{c.referenceId}</strong></span>
                    <span className="text-xs text-muted">Mở lúc: {new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="font-medium text-ink">{c.summary}</p>
                </div>

                {/* Timeline */}
                <div className="border-t border-rule pt-3 space-y-2">
                  <h4 className="text-xs font-bold text-ink-2 uppercase tracking-wider">Lịch sử xử lý & Bằng chứng:</h4>
                  <ul className="space-y-1.5 text-xs">
                    {c.timeline.map((t, idx) => (
                      <li key={idx} className="flex flex-wrap items-baseline gap-2 text-ink-2">
                        <span className="font-mono text-muted">{new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <strong className="text-ink">{t.actor}:</strong>
                        <span>{t.action}</span>
                        {t.evidenceUrl && (
                          <a
                            href={t.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent underline font-mono text-[11px]"
                          >
                            [Xem chứng từ]
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-rule">
                  {c.status === 'OPEN_UNASSIGNED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null)
                        setAssignOwnerId((prev) => prev || sessionUserId)
                        setSelectedCase(c)
                        setModalMode('ASSIGN')
                      }}
                      className="btn btn-primary text-xs px-3 py-1.5"
                    >
                      <UserCheck className="size-3.5" />
                      <span>Phân công người phụ trách</span>
                    </button>
                  )}

                  {c.status === 'ASSIGNED_IN_PROGRESS' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null)
                        setSelectedCase(c)
                        setModalMode('RESOLVE')
                      }}
                      className="btn btn-primary text-xs px-4 py-1.5"
                    >
                      <CheckCircle className="size-3.5" />
                      <span>Giải quyết vụ việc (Đính kèm bằng chứng)</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Assign Modal */}
      {modalMode === 'ASSIGN' && selectedCase && (
        <div
          role="dialog"
          aria-labelledby="assign-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        >
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-2xl space-y-4">
            <h3 id="assign-dialog-title" className="text-lg font-bold text-ink">
              Phân công Phụ trách Vụ việc
            </h3>
            <p className="text-sm text-ink-2">
              Chỉ định nhân viên phụ trách giải quyết cho case <span className="font-mono font-bold text-ink">{selectedCase.caseId}</span>:
            </p>

            <div>
              <label htmlFor="owner-select" className="block text-xs font-semibold text-ink-2">
                Mã nhân sự phụ trách (User ID):
              </label>
              <input
                id="owner-select"
                type="text"
                value={assignOwnerId}
                onChange={(e) => setAssignOwnerId(e.target.value)}
                placeholder="vd: ops-mgr-01"
                className="mt-1 w-full rounded-control border border-rule bg-paper-2 p-2.5 text-sm text-ink"
              />
            </div>

            {actionError && <FormAlert message={actionError} />}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="btn btn-secondary text-sm px-4"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending || !assignOwnerId.trim()}
                className="btn btn-primary text-sm px-4"
              >
                {assignMutation.isPending ? 'Đang lưu...' : 'Xác nhận phân công'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {modalMode === 'RESOLVE' && selectedCase && (
        <div
          role="dialog"
          aria-labelledby="resolve-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        >
          <div className="w-full max-w-md rounded-card border border-rule bg-paper p-6 shadow-2xl space-y-4">
            <h3 id="resolve-dialog-title" className="text-lg font-bold text-ink">
              Đóng Hồ sơ Ngoại lệ (Kèm Bằng chứng)
            </h3>
            <p className="text-sm text-ink-2">
              Mục 17 quy định: Hồ sơ không bao giờ tự đóng bằng timeout. Bắt buộc cung cấp tài liệu hoặc chứng từ giải quyết cho <span className="font-mono font-bold text-ink">{selectedCase.caseId}</span>.
            </p>

            <div>
              <label htmlFor="evidence-url" className="block text-xs font-semibold text-ink-2">
                URL Chứng từ / Biên bản (S3 Link):
              </label>
              <input
                id="evidence-url"
                type="url"
                value={resolutionEvidence}
                onChange={(e) => setResolutionEvidence(e.target.value)}
                placeholder="https://s3.ap-southeast-1.amazonaws.com/.../bien-ban.pdf"
                className="mt-1 w-full rounded-control border border-rule bg-paper-2 p-2.5 text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="resolution-note" className="block text-xs font-semibold text-ink-2">
                Kết luận giải quyết vụ việc:
              </label>
              <textarea
                id="resolution-note"
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Nhập giải trình chi tiết về cách khắc phục sự cố..."
                className="mt-1 w-full rounded-control border border-rule bg-paper-2 p-2.5 text-sm text-ink"
              />
            </div>

            {actionError && <FormAlert message={actionError} />}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="btn btn-secondary text-sm px-4"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => resolveMutation.mutate()}
                disabled={resolveMutation.isPending || (!resolutionEvidence && !resolutionNote)}
                className="btn btn-primary text-sm px-4 disabled:opacity-40"
              >
                {resolveMutation.isPending ? 'Đang lưu...' : 'Xác nhận giải quyết'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
