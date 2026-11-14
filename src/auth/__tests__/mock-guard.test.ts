/** @jest-environment node */
import { afterEach, describe, expect, it } from '@jest/globals'
import { isMockModeAllowed, isMockModeRequested } from '../mock-guard'

const original = { ...process.env }
const setEnv = (values: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else (process.env as Record<string, string>)[key] = value
  }
}

afterEach(() => {
  process.env = { ...original }
})

describe('mock mode guard', () => {
  it('is off unless mock mode is requested', () => {
    setEnv({ NEXT_PUBLIC_MOCK_MODE: 'false', NODE_ENV: 'development' })
    expect(isMockModeRequested()).toBe(false)
    expect(isMockModeAllowed()).toBe(false)
  })

  it('is allowed in development and test builds', () => {
    setEnv({ NEXT_PUBLIC_MOCK_MODE: 'true', NODE_ENV: 'development' })
    expect(isMockModeAllowed()).toBe(true)
    setEnv({ NODE_ENV: 'test' })
    expect(isMockModeAllowed()).toBe(true)
  })

  it('is refused in a production build unless explicitly allowed', () => {
    setEnv({
      NEXT_PUBLIC_MOCK_MODE: 'true',
      NODE_ENV: 'production',
      ALLOW_MOCK_IN_PRODUCTION: undefined,
    })
    expect(isMockModeRequested()).toBe(true)
    expect(isMockModeAllowed()).toBe(false)
    setEnv({ ALLOW_MOCK_IN_PRODUCTION: 'yes' })
    expect(isMockModeAllowed()).toBe(false)
    setEnv({ ALLOW_MOCK_IN_PRODUCTION: 'true' })
    expect(isMockModeAllowed()).toBe(true)
  })
})
