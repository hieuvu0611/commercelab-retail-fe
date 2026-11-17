'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatVnd } from '@/catalog/money'
import { FormAlert } from '@/components/auth/form-alert'
import {
  OLAP_ANALYTICS_KEY,
  fetchOlapAnalytics,
  syncOlapAnalytics,
} from '@/metrics/analytics-api'
import { StaffOnly } from './staff-only'

const ANALYTICS_ROLES = [
  'OPS_MGR',
  'FINANCE',
  'FINANCE_MGR',
  'SUPPORT_LEAD',
  'WAREHOUSE_MGR',
  'MARKETING',
  'ACCESS_ADMIN',
  'ADMIN',
] as const

export function AnalyticsDashboard() {
  return (
    <StaffOnly role={[...ANALYTICS_ROLES]} what="view ClickHouse OLAP analytics">
      <OlapView />
    </StaffOnly>
  )
}

function OlapView() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState('30D')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string>()
  const [syncErr, setSyncErr] = useState<string>()

  const olap = useQuery({
    queryKey: [...OLAP_ANALYTICS_KEY, period],
    queryFn: () => fetchOlapAnalytics(period),
    retry: false,
  })

  async function runSync() {
    setSyncing(true)
    setSyncNote(undefined)
    setSyncErr(undefined)
    try {
      const res = await syncOlapAnalytics()
      setSyncNote(
        `Synced ${res.ordersSynced} orders, ${res.shipmentsSynced} shipments, and ${res.inventoryRowsSynced} inventory rows into ClickHouse.`
      )
      await queryClient.invalidateQueries({ queryKey: OLAP_ANALYTICS_KEY })
    } catch (err) {
      setSyncErr(err instanceof Error ? err.message : 'ClickHouse sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="olap-period" className="font-label text-sm text-ink">
            Window
          </label>
          <select
            id="olap-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded border border-rule-2 bg-paper px-3 py-2 text-sm"
          >
            <option value="7D">Last 7 days</option>
            <option value="30D">Last 30 days</option>
            <option value="90D">Last 90 days</option>
          </select>
        </div>
        <button type="button" disabled={syncing} onClick={() => void runSync()} className="btn btn-primary">
          {syncing ? 'Syncing ClickHouse…' : 'Sync ClickHouse snapshot'}
        </button>
      </div>

      {syncNote && (
        <p role="status" className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink">
          {syncNote}
        </p>
      )}
      {syncErr && <FormAlert message={syncErr} />}

      {olap.isError ? (
        <FormAlert message="ClickHouse OLAP dashboard could not be loaded." />
      ) : !olap.data ? (
        <p role="status" className="text-ink-2">
          Querying ClickHouse OLAP…
        </p>
      ) : (
        <>
          <aside
            role="note"
            className="border-l-4 border-amber-600 bg-paper-2 px-4 py-3 text-sm text-ink"
          >
            <p className="font-label">
              {olap.data.metadata.source} ({olap.data.metadata.database}) ·{' '}
              {olap.data.metadata.lagSeconds !== null
                ? `Lag ${olap.data.metadata.lagSeconds}s (synced ${new Date(
                    olap.data.metadata.lastSyncedAt!
                  ).toLocaleTimeString('en-GB')})`
                : 'Not yet synced — click "Sync ClickHouse snapshot" to backfill'}
            </p>
            <p className="mt-1 text-xs text-ink-2">{olap.data.metadata.policyNotice}</p>
          </aside>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Orders" value={String(olap.data.kpis.totalOrders)} />
            <KpiCard label="Gross GMV" value={formatVnd(olap.data.kpis.grossGmvVnd)} />
            <KpiCard label="Discount Granted" value={formatVnd(olap.data.kpis.totalDiscountVnd)} />
            <KpiCard label="Avg Order Value" value={formatVnd(olap.data.kpis.avgOrderValueVnd)} />
            <KpiCard
              label="PREPAID vs COD"
              value={`${olap.data.kpis.prepaidOrders} / ${olap.data.kpis.codOrders}`}
            />
            <KpiCard label="Delivered Orders" value={String(olap.data.kpis.deliveredOrders)} />
            <KpiCard label="Open Exception Cases" value={String(olap.data.kpis.openExceptionCases)} />
            <KpiCard label="RMA Requests" value={String(olap.data.kpis.totalRmaRequests)} />
          </section>

          <section>
            <h2 className="font-label text-lg text-ink">Warehouse performance (OLAP)</h2>
            {olap.data.byWarehouse.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No warehouse facts synced yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-rule-2 text-ink">
                      <th className="font-label py-2 pr-4">Warehouse</th>
                      <th className="font-label py-2 pr-4">Shipments</th>
                      <th className="font-label py-2 pr-4">Delivered</th>
                      <th className="font-label py-2 pr-4">COD Assigned</th>
                      <th className="font-label py-2 pr-4">Available Units</th>
                      <th className="font-label py-2">Reserved Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {olap.data.byWarehouse.map((wh) => (
                      <tr key={wh.warehouseId} className="border-b border-rule">
                        <td className="py-2 pr-4 font-label text-ink">{wh.warehouseId}</td>
                        <td className="py-2 pr-4 tabular-nums">{wh.shipments}</td>
                        <td className="py-2 pr-4 tabular-nums">{wh.delivered}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatVnd(wh.codToCollectVnd)}</td>
                        <td className="py-2 pr-4 tabular-nums">{wh.availableUnits}</td>
                        <td className="py-2 tabular-nums">{wh.reservedUnits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-label text-lg text-ink">Orders by status (OLAP)</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {olap.data.byStatus.map((row) => (
                <div key={row.status} className="rounded border border-rule bg-paper-2 p-3 text-sm">
                  <p className="font-label text-ink">{row.status}</p>
                  <p className="mt-1 text-xs text-ink-2">
                    {row.orders} order(s) · {formatVnd(row.gmvVnd)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-rule bg-paper-2 p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums text-ink">{value}</p>
    </div>
  )
}
