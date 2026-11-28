'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en, type MessageKey } from './dictionaries/en'
import { vi } from './dictionaries/vi'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  isLocale,
  type Locale,
  type TranslationParams,
} from './types'

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = {
  en,
  vi,
}

const COOKIE_MAX_AGE_SECONDS = 31536000

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslationParams
): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
  const template = dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE][key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(params, token)) {
      return String(params[token])
    }
    return match
  })
}

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: TranslationParams) => string
}

const DEFAULT_CONTEXT: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, params) => translate(DEFAULT_LOCALE, key, params),
}

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT)

function readLocaleFromCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const prefix = `${LOCALE_COOKIE_NAME}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length)
      if (isLocale(value)) return value
    }
  }
  return null
}

function readStoredLocale(): Locale | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (isLocale(stored)) return stored
    } catch {
      // Ignore storage access restrictions and fall back to cookie lookup.
    }
  }
  return readLocaleFromCookie()
}

function persistLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Ignore storage access restrictions when persisting locale.
    }
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
    document.documentElement.lang = locale
  }
}

interface I18nProviderProps {
  children: ReactNode
  initialLocale?: Locale
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)

  useEffect(() => {
    if (initialLocale) return
    const saved = readStoredLocale()
    if (saved && saved !== DEFAULT_LOCALE) {
      setLocaleState(saved)
    }
  }, [initialLocale])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return
    setLocaleState(next)
    persistLocale(next)
  }, [])

  const t = useCallback(
    (key: MessageKey, params?: TranslationParams) => translate(locale, key, params),
    [locale]
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
