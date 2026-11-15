import { enUS, Locale } from 'date-fns/locale'

/**
 * Mapping of language codes to date-fns locales. en-US is the only language
 * shipped.
 */
const LOCALE_MAP: Record<string, Locale> = {
  'en-US': enUS,
}

/**
 * Get the date-fns locale for a given language code.
 * Falls back to English (en-US) if the language is not found.
 *
 * @param language - The language code (e.g., 'en-US')
 * @returns The corresponding date-fns Locale object
 */
export function getDateLocale(language: string): Locale {
  return LOCALE_MAP[language] || enUS
}
