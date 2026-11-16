import { Metadata } from 'next'
import { PurchasingOrdersAdmin } from '@/components/admin/purchasing-orders-admin'

export const metadata: Metadata = {
  title: 'Purchase Orders | Backoffice',
}

export default function PurchasingPage() {
  return <PurchasingOrdersAdmin />
}
