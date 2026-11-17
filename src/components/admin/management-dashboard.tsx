'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  TrendingUp,
  DollarSign,
  Package,
  Truck,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { fetchManagementMetrics, METRICS_KEY } from '@/metrics/metrics-api'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/utils/tw-merge'

export function ManagementDashboard() {
  const [period, setPeriod] = useState<'TODAY' | '7D' | '30D'>('TODAY')

  const { data: metrics, isLoading, refetch, isFetching } = useQuery({
    queryKey: METRICS_KEY(period),
    queryFn: () => fetchManagementMetrics(period),
  })

  return (
    <div className="space-y-8">
      {/* Page Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Báo cáo Quản trị Điều hành (Executive Dashboard)
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            Tổng hợp dữ liệu tập trung về Tiền - Hàng - Đơn - Giao vận và Tuổi thọ sự cố ngoại lệ theo Mục 18.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-control border border-rule bg-paper p-1 text-xs font-semibold">
            {(['TODAY', '7D', '30D'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-xs px-3 py-1 transition-colors',
                  period === p ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'
                )}
              >
                {p === 'TODAY' && 'Hôm nay'}
                {p === '7D' && '7 Ngày'}
                {p === '30D' && '30 Ngày'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh metrics"
            className="btn btn-secondary size-9 p-0 inline-flex items-center justify-center"
          >
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Critical SC12 Banner */}
      {metrics?.metadata && (
        <div
          data-testid="sc12-policy-banner"
          className="rounded-card border border-rule bg-paper-2 p-4 text-xs text-ink-2 space-y-1 shadow-xs"
        >
          <div className="flex items-center gap-2 text-ink font-semibold">
            <ShieldAlert className="size-4 text-warn shrink-0" />
            <span>Nguồn dữ liệu & Quy tắc Bất biến SC12:</span>
          </div>
          <p className="leading-relaxed">
            <strong>Nguồn:</strong> {metrics.metadata.source} · <strong>Cập nhật lúc:</strong>{' '}
            {new Date(metrics.metadata.asOf).toLocaleTimeString()} · {metrics.metadata.policyNotice}
          </p>
        </div>
      )}

      {isLoading || !metrics ? (
        <div className="py-12 text-center text-sm text-ink-2">Đang nạp số liệu báo cáo...</div>
      ) : (
        <>
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Net Collection */}
            <div className="rounded-card border border-rule bg-paper p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-2">Thực thu ròng (Net Collection)</span>
                <span className="rounded-full bg-ok-soft p-1.5 text-ok">
                  <DollarSign className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-ink">
                {formatCurrency(metrics.overview.netCollectionVnd)}
              </div>
              <p className="text-[11px] text-muted">
                Thu: {formatCurrency(metrics.overview.grossCollectedVnd)} · Hoàn:{' '}
                {formatCurrency(metrics.overview.totalRefundedVnd)}
              </p>
            </div>

            {/* Confirmation Rate */}
            <div className="rounded-card border border-rule bg-paper p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-2">Tỷ lệ xác nhận đơn</span>
                <span className="rounded-full bg-accent/10 p-1.5 text-accent">
                  <TrendingUp className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-ink">
                {metrics.overview.confirmationRate}%
              </div>
              <p className="text-[11px] text-muted">
                {metrics.overview.confirmedOrders} thành công / {metrics.overview.totalOrders} ý định mua
              </p>
            </div>

            {/* Available Inventory */}
            <div className="rounded-card border border-rule bg-paper p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-2">Tồn kho khả dụng (I01)</span>
                <span className="rounded-full bg-paper-2 p-1.5 text-ink-2">
                  <Package className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-ink">
                {metrics.overview.availableInventoryUnits.toLocaleString()} sp
              </div>
              <p className="text-[11px] text-muted">
                Đang giữ cho giỏ/đơn: {metrics.overview.reservedInventoryUnits} sp
              </p>
            </div>

            {/* On-Time Delivery */}
            <div className="rounded-card border border-rule bg-paper p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-2">Tỷ lệ giao đúng hẹn</span>
                <span className="rounded-full bg-ok-soft p-1.5 text-ok">
                  <Truck className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-ink">
                {metrics.overview.onTimeDeliveryRate}%
              </div>
              <p className="text-[11px] text-muted">Vận hành giao vận bưu phẩm WH-HCM-01</p>
            </div>
          </div>

          {/* Operational Exception Aging Section */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-card border border-rule bg-paper p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="font-label text-base font-bold text-ink">
                  Tuổi thọ Sự cố Ngoại lệ (Case Aging - Mục 17)
                </h3>
                <span className="rounded-xs bg-paper-2 px-2 py-0.5 text-xs font-bold text-ink">
                  {metrics.caseAging.totalOpenCases} vụ việc đang mở
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-control bg-paper-2 p-3">
                  <span className="text-xs text-ink-2 block">&lt; 2 Giờ</span>
                  <span className="text-xl font-bold text-ink">{metrics.caseAging.openUnder2h}</span>
                </div>
                <div className="rounded-control bg-paper-2 p-3">
                  <span className="text-xs text-ink-2 block">2 - 24 Giờ</span>
                  <span className="text-xl font-bold text-ink">{metrics.caseAging.open2to24h}</span>
                </div>
                <div className="rounded-control bg-paper-2 p-3">
                  <span className="text-xs text-ink-2 block">&gt; 24 Giờ</span>
                  <span className="text-xl font-bold text-warn">{metrics.caseAging.openOver24h}</span>
                </div>
              </div>

              {metrics.caseAging.overdueSlaCount > 0 && (
                <div className="flex items-center gap-2 rounded-control border border-warn bg-warn-soft p-3 text-xs text-warn">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Có <strong>{metrics.caseAging.overdueSlaCount} vụ việc</strong> chưa được phân công người phụ trách quá hạn SLA 30 phút.
                  </span>
                </div>
              )}

              <div className="pt-2">
                <Link
                  href="/admin/cases"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                >
                  <span>Mở bảng quản lý hồ sơ ngoại lệ</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>

            {/* Quick Action Navigation */}
            <div className="rounded-card border border-rule bg-paper p-6 space-y-4 shadow-xs">
              <h3 className="font-label text-base font-bold text-ink border-b border-rule pb-3">
                Cổng Điều hướng Vận hành Nhanh
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  href="/admin/approvals"
                  className="rounded-control border border-rule p-3.5 hover:bg-paper-2 transition-colors space-y-1 block"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-ink">Hàng đợi Phê duyệt</span>
                    <Clock className="size-4 text-ink-2" />
                  </div>
                  <p className="text-xs text-ink-2">Maker ≠ Checker cho hoàn tiền, xuất kho và PO</p>
                </Link>

                <Link
                  href="/admin/cases"
                  className="rounded-control border border-rule p-3.5 hover:bg-paper-2 transition-colors space-y-1 block"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-ink">Hồ sơ Ngoại lệ</span>
                    <AlertTriangle className="size-4 text-warn" />
                  </div>
                  <p className="text-xs text-ink-2">Theo dõi và phân công sự cố trong 30 phút</p>
                </Link>

                <Link
                  href="/admin/ledger"
                  className="rounded-control border border-rule p-3.5 hover:bg-paper-2 transition-colors space-y-1 block"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-ink">Sổ cái Kế toán (SC11)</span>
                    <DollarSign className="size-4 text-ink-2" />
                  </div>
                  <p className="text-xs text-ink-2">Nhật ký bút toán kép Nợ = Có và đối soát S3</p>
                </Link>

                <Link
                  href="/admin/orders"
                  className="rounded-control border border-rule p-3.5 hover:bg-paper-2 transition-colors space-y-1 block"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-ink">Quản lý Đơn hàng</span>
                    <Package className="size-4 text-ink-2" />
                  </div>
                  <p className="text-xs text-ink-2">Tra cứu đơn hàng, thanh toán và vận đơn kho</p>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
