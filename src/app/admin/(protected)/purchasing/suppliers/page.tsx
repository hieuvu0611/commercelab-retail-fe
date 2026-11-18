import { Metadata } from 'next'
import { SuppliersAdmin } from '@/components/admin/suppliers-admin'

export const metadata: Metadata = {
  title: 'Suppliers | Backoffice',
}

export default function SuppliersPage() {
  return <SuppliersAdmin />
}
