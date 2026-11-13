'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { createTranslator, LOCALE_COOKIE, type Locale, type Translate } from './messages';

/** What useI18n gives a component: the language, the translator and how to switch language. */
interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const ONE_YEAR_SECONDS = 31_536_000;

/** Holds the UI language; switching it saves a cookie and retranslates every page at once. */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Strict`;
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);
  const value = useMemo(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The language and translator of the page. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
