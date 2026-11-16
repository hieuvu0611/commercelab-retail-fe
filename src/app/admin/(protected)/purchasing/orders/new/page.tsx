import { Metadata } from 'next'
import { PurchasingOrderNew } from '@/components/admin/purchasing-order-new'

export const metadata: Metadata = {
  title: 'New Purchase Order | Backoffice',
}

export default function NewPurchasingOrderPage() {
  return <PurchasingOrderNew />
}
