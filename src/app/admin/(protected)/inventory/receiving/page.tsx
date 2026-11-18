import type { Metadata } from 'next'
import { ReceivingAdmin } from '@/components/admin/receiving-admin'

export const metadata: Metadata = {
  title: 'Inbound Receiving & QC — CommerceLab Retail',
}

export default function AdminReceivingPage() {
  return (
    <section className="max-w-[72rem]">
      <ReceivingAdmin />
    </section>
  )
}
