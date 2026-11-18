import type { Metadata } from 'next'
import { ReturnDetailAdmin } from '@/components/admin/return-detail-admin'

export const metadata: Metadata = {
  title: 'Return Workbench — CommerceLab Retail Admin',
}

export default async function AdminReturnDetailPage({
  params,
}: Readonly<{
  params: Promise<{ rmaId: string }>
}>) {
  const { rmaId } = await params
  return <ReturnDetailAdmin rmaId={rmaId} />
}
