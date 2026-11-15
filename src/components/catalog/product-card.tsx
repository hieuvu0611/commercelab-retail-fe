import Link from 'next/link'
import { cn } from '@/utils/tw-merge'
import { swatchColor } from '@/catalog/colors'
import { formatPriceRange } from '@/catalog/money'
import type { ProductListItem } from '@/types/catalog'
import { AvailabilityBadge } from './availability-badge'

export function ProductCard({
  product,
  className,
}: {
  product: ProductListItem
  className?: string
}) {
  const colors = product.attributes.color ?? []
  return (
    <li className={cn('flex flex-col', className)}>
      <Link href={`/p/${product.slug}`} className="group flex flex-col gap-3 no-underline">
        <div className="aspect-square overflow-hidden bg-paper-2">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          )}
        </div>
        <div>
          <p className="font-label text-ink group-hover:underline">{product.name}</p>
          <p className="text-sm text-muted">{product.brand}</p>
          <p className="font-label mt-1 text-ink">
            {formatPriceRange(product.minPriceVnd, product.maxPriceVnd)}
            <span className="ml-1 text-xs font-normal text-muted">incl. VAT</span>
          </p>
          <AvailabilityBadge state={product.availability ?? 'unknown'} className="mt-1" />
        </div>
      </Link>
      {colors.length > 0 && (
        <ul aria-label="Colours" className="mt-2 flex gap-1.5">
          {colors.map((color) => (
            <li
              key={color}
              title={color}
              style={{ backgroundColor: swatchColor(color) }}
              className="size-4 border border-rule-2"
            >
              <span className="sr-only">{color}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
