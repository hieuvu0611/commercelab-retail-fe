import { useUserStore } from '@/stores/user-store'
import { createApiClient } from './api-client'

// Token source until the NextAuth session replaces the user store (P1-T11).
const getAccessToken = () => useUserStore.getState().accessToken

// NEXT_PUBLIC_* values must be read literally so Next.js can inline them.

/** Storefront API gateway (Go, :8080). */
export const storefrontApi = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  getAccessToken,
})

/** Backoffice and customer support BFF (NestJS, :8088). */
export const backofficeApi = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_BACKOFFICE_API_BASE_URL,
  getAccessToken,
})
