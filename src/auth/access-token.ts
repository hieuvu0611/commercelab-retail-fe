// The access token of the current session, kept in memory for the API clients (axios reads it from here).
// It is short-lived (15 minutes) and is never written to localStorage; the long-lived refresh token stays in
// the httpOnly NextAuth cookie and is never exposed to browser code.
let current: string | null = null

export function setAccessToken(token: string | null | undefined): void {
  current = token ?? null
}

export function getAccessToken(): string | null {
  return current
}
