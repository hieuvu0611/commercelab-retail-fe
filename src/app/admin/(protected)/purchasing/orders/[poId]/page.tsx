import { Metadata } from 'next'
import { PurchasingOrderDetail } from '@/components/admin/purchasing-order-detail'

export const metadata: Metadata = {
  title: 'Purchase Order Detail | Backoffice',
}

interface PageProps {
  params: Promise<{ poId: string }>
}

export default async function PurchasingOrderDetailPage({ params }: PageProps) {
  const { poId } = await params
  return <PurchasingOrderDetail poId={poId} />
}
