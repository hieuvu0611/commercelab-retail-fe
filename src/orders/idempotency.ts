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

const CANCEL_PREFIX = 'commercelab.cancel-key.'

function keyFor(prefix: string, id: string, storage: KeyStorage | null): string {
  const stored = storage?.getItem(prefix + id)
  if (stored) return stored
  const key = crypto.randomUUID()
  storage?.setItem(prefix + id, key)
  return key
}

export function keyForQuote(
  quoteId: string,
  storage: KeyStorage | null = defaultStorage()
): string {
  return keyFor(PREFIX, quoteId, storage)
}

/** One key per order: asking again to cancel the same order (double click, retry after a timeout) replays one result. */
export function keyForCancel(
  orderId: string,
  storage: KeyStorage | null = defaultStorage()
): string {
  return keyFor(CANCEL_PREFIX, orderId, storage)
}

export function forgetKey(quoteId: string, storage: KeyStorage | null = defaultStorage()): void {
  storage?.removeItem(PREFIX + quoteId)
}
