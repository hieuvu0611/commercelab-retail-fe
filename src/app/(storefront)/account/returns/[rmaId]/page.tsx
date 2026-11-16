import type { Metadata } from 'next'
import { ReturnDetailView } from '@/components/returns/return-detail-view'

export const metadata: Metadata = {
  title: 'Return Details — CommerceLab Retail',
}

export default async function ReturnDetailPage({
  params,
}: Readonly<{
  params: Promise<{ rmaId: string }>
}>) {
  const { rmaId } = await params
  return <ReturnDetailView returnId={rmaId} />
}
