import type { Metadata } from 'next'
import { PosTerminalAdmin } from '@/components/admin/pos-terminal-admin'

export const metadata: Metadata = {
  title: 'Counter POS — CommerceLab Retail',
}

export default function AdminPosPage() {
  return (
    <section className="max-w-[68rem]">
      <h1 className="text-3xl">Counter POS</h1>
      <p className="mt-2 max-w-[64ch] text-ink-2">
        Record walk-in store sales directly against shared warehouse inventory with cash or card
        terminal payment.
      </p>
      <PosTerminalAdmin />
    </section>
  )
}
