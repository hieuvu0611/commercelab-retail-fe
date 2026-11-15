import type { Metadata } from 'next'
import { AddressBook } from '@/components/account/address-book'

export const metadata: Metadata = {
  title: 'Addresses — CommerceLab Retail',
}

export default function AccountAddressesPage() {
  return <AddressBook />
}
