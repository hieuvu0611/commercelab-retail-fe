// One Idempotency-Key per return request. Keeping it in sessionStorage means
// repeated submits (double click, timeout retry) send the exact same key.

const PREFIX = 'commercelab.return-key.'

interface KeyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const defaultStorage = (): KeyStorage | null =>
  typeof window === 'undefined' ? null : window.sessionStorage

export function keyForReturn(
  orderId: string,
  storage: KeyStorage | null = defaultStorage()
): string {
  const stored = storage?.getItem(PREFIX + orderId)
  if (stored) return stored
  const key = crypto.randomUUID()
  storage?.setItem(PREFIX + orderId, key)
  return key
}

export function forgetReturnKey(
  orderId: string,
  storage: KeyStorage | null = defaultStorage()
): void {
  storage?.removeItem(PREFIX + orderId)
}
