import { enUS } from './en-US';

// LSP-SIET ships one language. `lib/i18n.ts` falls back to en-US for anything
// else a browser or a stale stored setting asks for.
export const resources = {
  'en-US': { translation: enUS },
} as const;

export type TranslationKeys = typeof enUS;

export { enUS };
