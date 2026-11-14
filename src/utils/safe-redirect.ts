const AUTH_PAGES = ['/login', '/register', '/admin/login']

/**
 * Returns `raw` only when it is a path inside this app, otherwise `fallback`. This keeps the `callbackUrl`
 * parameter from becoming an open redirect, and never sends a signed-in user back to a sign-in page.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = '/'): string {
  const value = raw?.trim()
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback
  const path = value.split(/[?#]/)[0]
  if (AUTH_PAGES.includes(path)) return fallback
  return value
}
