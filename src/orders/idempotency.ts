// One Idempotency-Key per accepted quote. Keeping it for the quote means a double click, a refresh or a retry after a
// timeout sends the same key, so the server replays the one order instead of creating a second (SC04).

const PREFIX = 'commercelab.order-key.'

interface KeyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const defaultStorage = (): KeyStorage | null =>
  typeof window === 'undefined' ? null : window.sessionStorage

export function keyForQuote(
  quoteId: string,
  storage: KeyStorage | null = defaultStorage()
): string {
  const stored = storage?.getItem(PREFIX + quoteId)
  if (stored) return stored
  const key = crypto.randomUUID()
  storage?.setItem(PREFIX + quoteId, key)
  return key
}

export function forgetKey(quoteId: string, storage: KeyStorage | null = defaultStorage()): void {
  storage?.removeItem(PREFIX + quoteId)
}
