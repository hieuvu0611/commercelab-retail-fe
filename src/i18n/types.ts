export type Locale = 'en' | 'vi'

export const DEFAULT_LOCALE: Locale = 'en'

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'vi'] as const

export const LOCALE_STORAGE_KEY = 'commercelab_locale'

export const LOCALE_COOKIE_NAME = 'commercelab_locale'

export type TranslationParams = Record<string, string | number>

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'vi'
}
