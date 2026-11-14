import { signOut } from 'next-auth/react'
import { getAccessToken } from '@/auth/access-token'
import { createApiClient } from './api-client'

// A 401 from the API means the session is no longer valid (the server refreshes tokens before they expire).
const onUnauthorized = () => {
  if (typeof window !== 'undefined') void signOut({ callbackUrl: '/login' })
}

// NEXT_PUBLIC_* values must be read literally so Next.js can inline them.

/** Storefront API gateway (Go, :8080). */
export const storefrontApi = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  getAccessToken,
  onUnauthorized,
})

/** Backoffice and customer support BFF (NestJS, :8088). */
export const backofficeApi = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_BACKOFFICE_API_BASE_URL,
  getAccessToken,
  onUnauthorized,
})
