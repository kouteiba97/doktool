'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { createTranslator, LOCALE_COOKIE, type Locale, type Translate } from './messages';

interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const ONE_YEAR_SECONDS = 31_536_000;

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

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
