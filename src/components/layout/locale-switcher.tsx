'use client'

import { useI18n, type Locale } from '@/i18n'
import { cn } from '@/utils/tw-merge'

const LOCALE_OPTIONS: ReadonlyArray<{
  code: Locale
  labelKey: 'common.localeEn' | 'common.localeVi'
  titleKey: 'common.switchToEn' | 'common.switchToVi'
}> = [
  { code: 'en', labelKey: 'common.localeEn', titleKey: 'common.switchToEn' },
  { code: 'vi', labelKey: 'common.localeVi', titleKey: 'common.switchToVi' },
]

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn(
        'inline-flex h-8 items-center rounded-control border border-rule bg-paper p-0.5',
        className
      )}
    >
      {LOCALE_OPTIONS.map((option) => {
        const isActive = locale === option.code
        return (
          <button
            key={option.code}
            type="button"
            aria-pressed={isActive}
            title={t(option.titleKey)}
            onClick={() => setLocale(option.code)}
            className={cn(
              'font-label inline-flex h-full items-center rounded-xs px-2 text-xs transition-colors duration-150',
              isActive
                ? 'bg-ink text-paper'
                : 'text-ink-2 hover:bg-paper-2 hover:text-ink'
            )}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
