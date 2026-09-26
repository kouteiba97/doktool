import { IntlMessageFormat } from 'intl-messageformat';
import en from '@doktool/i18n/messages.en.json';
import fr from '@doktool/i18n/messages.fr.json';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
/** Admin Web's UI language, remembered per browser (read on the server for `<html lang>`). */
export const LOCALE_COOKIE = 'doktool_admin_locale';

/** Keys Admin Web may use: its own namespace and the shared one (packages/i18n README). */
export type MessageKey = Extract<keyof typeof fr, `admin.${string}` | `common.${string}`>;
export type MessageValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: MessageValues) => string;

const catalogues: Record<Locale, Record<string, string>> = { fr, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** ICU formatter over the shared catalogue; compiled messages are cached per translator. */
export function createTranslator(locale: Locale): Translate {
  const cache = new Map<string, IntlMessageFormat>();
  return (key, values) => {
    let format = cache.get(key);
    if (!format) {
      const message = catalogues[locale][key];
      if (message === undefined) throw new Error(`Missing catalogue key "${key}"`);
      format = new IntlMessageFormat(message, locale);
      cache.set(key, format);
    }
    return String(format.format(values));
  };
}
