import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './locales'
import { extendI18n } from './extensions'

// en-US is the only language: no detection, no picker. A language stored by an
// older build (or asked for by the browser) is ignored, and `fallbackLng`
// keeps every lookup on en-US if one is ever passed in.
export const i18nOptions = {
  resources,
  lng: 'en-US',
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false, // react already safes from xss
  },
  react: {
    useSuspense: false,
  },
}

i18n.use(initReactI18next).init(i18nOptions)

// KMITL hook: installed extensions add or override translations
extendI18n(i18n)

export default i18n
