import { useTranslation as useI18nTranslation } from 'react-i18next'
import { useMemo } from 'react'

/**
 * Thin wrapper around react-i18next's useTranslation hook.
 * Returns the standard t() function and the active language (always en-US).
 */
export function useTranslation() {
  const { t, i18n } = useI18nTranslation()

  return useMemo(() => ({
    t,
    i18n,
    language: i18n.language,
  }), [t, i18n])
}
