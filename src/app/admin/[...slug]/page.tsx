import { notFound } from 'next/navigation'

// Unbuilt backoffice paths render the admin not-found page inside the admin shell.
export default function AdminCatchAll() {
  notFound()
}
