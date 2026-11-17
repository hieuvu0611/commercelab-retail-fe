import { CampaignsAdmin } from '@/components/admin/campaigns-admin'

export const metadata = {
  title: 'Promotion Campaigns — CommerceLab Admin',
}

export default function AdminCampaignsPage() {
  return (
    <main className="mx-auto max-w-[68rem] px-6 py-10">
      <p className="text-xs uppercase tracking-widest text-muted">Marketing · B08</p>
      <h1 className="mt-1 text-3xl text-ink">Promotion campaigns</h1>
      <p className="mt-2 text-sm text-ink-2">
        Configure B08 rules, VND budgets, quotas, customer segments, priority order, and stackability.
      </p>
      <CampaignsAdmin />
    </main>
  )
}
