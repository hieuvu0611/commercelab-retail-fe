import Link from 'next/link'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { BreadcrumbEntry } from '@/types/catalog'

export function CatalogBreadcrumb({ entries }: { entries: BreadcrumbEntry[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {entries.map((entry, index) => (
          <Fragment key={`${entry.label}-${index}`}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {entry.href ? (
                <Link href={entry.href} className="text-ink-2 underline">
                  {entry.label}
                </Link>
              ) : (
                <BreadcrumbPage>{entry.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
