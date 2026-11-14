import Link from 'next/link'

interface WordmarkProps {
  href: string
  suffix?: string
}

export function Wordmark({ href, suffix }: WordmarkProps) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-ink no-underline">
      <span className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-extrabold leading-none tracking-(--tracking-display) [font-variation-settings:'wdth'_75,'opsz'_96]">
          CommerceLab
        </span>
        {suffix && <span className="font-label hidden text-sm text-muted sm:inline">{suffix}</span>}
      </span>
    </Link>
  )
}
