'use client'

import { signOut, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { setAccessToken } from './access-token'

/** Keeps the in-memory access token in step with the session, and ends a session whose refresh failed. */
export function AccessTokenSync() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const failed = session?.error !== undefined

  // Set during render so child effects that fire API calls already see the token.
  setAccessToken(accessToken)

  useEffect(() => {
    if (failed) void signOut({ callbackUrl: '/login' })
  }, [failed])

  return null
}
