'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { StatusMessage } from '@/components/layout/status-message'
import { Wordmark } from '@/components/layout/wordmark'
import { STOREFRONT_ROUTES } from '@/configs/navigation'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="shell-container flex min-h-dvh flex-col gap-12 py-6">
      <Wordmark href={STOREFRONT_ROUTES.home} />
      <main id="main-content">
        <StatusMessage
          title="Something went wrong"
          description="This page could not be loaded. Try again, or go back to the shop."
          actions={
            <>
              <button type="button" onClick={reset} className="btn btn-primary">
                Try again
              </button>
              <Link href={STOREFRONT_ROUTES.home} className="btn btn-secondary">
                Back to the shop
              </Link>
            </>
          }
        />
      </main>
    </div>
  )
}
