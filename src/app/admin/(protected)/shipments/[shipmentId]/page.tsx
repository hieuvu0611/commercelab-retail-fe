import type { Metadata } from 'next'
import { ShipmentAdminDetail } from '@/components/admin/shipment-detail'

export const metadata: Metadata = {
  title: 'Shipment — CommerceLab Retail',
}

export default async function AdminShipmentPage({
  params,
}: Readonly<{ params: Promise<{ shipmentId: string }> }>) {
  const { shipmentId } = await params
  return (
    <section className="max-w-[64rem]">
      <h1 className="text-3xl">Shipment</h1>
      <ShipmentAdminDetail shipmentId={shipmentId} />
    </section>
  )
}
