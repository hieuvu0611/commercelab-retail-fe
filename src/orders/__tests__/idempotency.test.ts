import { forgetKey, keyForQuote } from '../idempotency'

const memory = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe('idempotency key per quote', () => {
  it('returns the same key for the same quote so a retry replays the order', () => {
    const storage = memory()
    expect(keyForQuote('q1', storage)).toBe(keyForQuote('q1', storage))
  })

  it('uses a different key for another quote and a valid header value', () => {
    const storage = memory()
    expect(keyForQuote('q1', storage)).not.toBe(keyForQuote('q2', storage))
    expect(keyForQuote('q1', storage)).toMatch(/^[A-Za-z0-9._:-]{1,128}$/)
  })

  it('creates a fresh key after the old one was forgotten', () => {
    const storage = memory()
    const first = keyForQuote('q1', storage)
    forgetKey('q1', storage)
    expect(keyForQuote('q1', storage)).not.toBe(first)
  })
})
