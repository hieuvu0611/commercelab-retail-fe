'use client'

import { useI18n } from './context'
import type { MessageKey } from './dictionaries/en'
import type { TranslationParams } from './types'

interface TranslatedTextProps {
  id: MessageKey
  params?: TranslationParams
}

export function TranslatedText({ id, params }: TranslatedTextProps) {
  const { t } = useI18n()
  return <>{t(id, params)}</>
}
