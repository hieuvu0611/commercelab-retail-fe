import { Metadata } from 'next'
import { FinanceLedgerAdmin } from '@/components/admin/finance-ledger-admin'

export const metadata: Metadata = {
  title: 'Finance & Ledger | Backoffice',
}

export default function LedgerPage() {
  return <FinanceLedgerAdmin />
}
