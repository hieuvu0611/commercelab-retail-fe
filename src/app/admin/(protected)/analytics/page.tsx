import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard'

export const metadata = {
  title: 'OLAP Analytics (ClickHouse) — CommerceLab Admin',
}

export default function AdminAnalyticsPage() {
  return (
    <main className="mx-auto max-w-[68rem] px-6 py-10">
      <p className="text-xs uppercase tracking-widest text-muted">Polyglot OLAP · SC12</p>
      <h1 className="mt-1 text-3xl text-ink">ClickHouse OLAP Analytics</h1>
      <p className="mt-2 text-sm text-ink-2">
        Read-model analytical KPIs by warehouse and order status synchronized from transactional services.
      </p>
      <AnalyticsDashboard />
    </main>
  )
}
