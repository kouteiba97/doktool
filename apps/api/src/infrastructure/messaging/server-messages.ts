import { Injectable } from '@nestjs/common';
import en from '@doktool/i18n/messages.en.json' with { type: 'json' };
import fr from '@doktool/i18n/messages.fr.json' with { type: 'json' };
import { IntlMessageFormat } from 'intl-messageformat';

/** Languages of server texts (the account's language). */
export type MessageLocale = 'FR' | 'EN';

const CATALOGUES: Record<MessageLocale, Record<string, string>> = { FR: fr, EN: en };
const LOCALE_TAGS: Record<MessageLocale, string> = { FR: 'fr', EN: 'en' };

/** Server-rendered texts (e-mails, SMS) from the `server.*` keys of packages/i18n. */
@Injectable()
export class ServerMessages {
  private readonly cache = new Map<string, IntlMessageFormat>();

  /**
   * Formats one ICU message of the shared catalogue (e.g. a code e-mail) with its values;
   * formatters are cached per locale and key.
   */
  format(locale: MessageLocale, key: string, values: Record<string, string | number> = {}): string {
    const cacheKey = `${locale}:${key}`;
    let formatter = this.cache.get(cacheKey);
    if (!formatter) {
      const source = CATALOGUES[locale][key];
      if (source === undefined) throw new Error(`Missing catalogue key "${key}"`);
      formatter = new IntlMessageFormat(source, LOCALE_TAGS[locale]);
      this.cache.set(cacheKey, formatter);
    }
    return String(formatter.format(values));
  }
}
