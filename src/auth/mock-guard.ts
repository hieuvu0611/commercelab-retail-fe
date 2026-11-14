/**
 * Mock mode serves a fake backend from inside the app (see mock-iam.ts and app/mock-api). It must never
 * act as a sign-in bypass on a real deployment, so in a production build it is off unless the operator
 * also sets the server-only ALLOW_MOCK_IN_PRODUCTION=true (used to demo or test a production build).
 */
export function isMockModeRequested(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
}

export function isMockModeAllowed(): boolean {
  if (!isMockModeRequested()) return false
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_IN_PRODUCTION === 'true'
}
